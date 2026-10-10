import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configRoot } from "../mode/paths.ts";
import { pyJson, pyStr, quote, strip } from "../text.ts";
import { isRecord, record, str, type Payload } from "./io.ts";

export type Entry = Payload;
export type Task = Payload & { id?: unknown; subject?: unknown; status?: unknown; owner?: unknown };
export type Call = [name: string, args: Payload];
export type Category = "AI" | "USER" | "WAIT";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const DELEGATE_TOOLS = new Set(["Agent", "Task", "Workflow", "SendMessage"]);
const BOARD_TOOLS = new Set(["TaskCreate", "TaskUpdate"]);

const MUTATING_SHELL =
  /\b(?:git\s+(?:commit|push|merge|rebase|reset|revert|cherry-pick|tag)|rm\s|mv\s|mkdir\s|tee\s|truncate\s|(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|publish)|glab\s+mr|gh\s+(?:pr|issue|release))\b/;

// Past this size the transcript costs more to parse than the nudge is worth.
const MAX_TRANSCRIPT_BYTES = 24 * 1024 * 1024;

// Arrives in the user role but nobody typed it, so there is no request to read back.
const INJECTED_TAGS = [
  "<local-command-stdout",
  "<local-command-stderr",
  "<bash-stdout",
  "<bash-stderr",
  "<system-reminder",
  "<task-notification",
  "<teammate-message",
  "<user-prompt-submit-hook",
];

function contentOf(entry: Entry): unknown {
  return isRecord(entry.message) ? entry.message.content : undefined;
}

function isToolResult(content: unknown): boolean {
  return (
    Array.isArray(content) &&
    content.some((item) => isRecord(item) && (item.type === "tool_result" || "tool_use_id" in item))
  );
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item) => isRecord(item) && item.type === "text")
    .map((item) => str((item as Payload).text))
    .join("\n");
}

function isInjected(text: string): boolean {
  if (text.startsWith("[Request interrupted by user")) return true;
  // Wrappers can ride behind a preamble line ("Another Claude session sent a message:").
  return text
    .split("\n")
    .slice(0, 3)
    .some((line) => INJECTED_TAGS.some((tag) => strip(line).startsWith(tag)));
}

function isGenuineUser(entry: Entry): boolean {
  if (entry.type !== "user" || entry.isMeta || entry.isCompactSummary || entry.isSidechain) return false;
  const content = contentOf(entry);
  if (isToolResult(content)) return false;
  const text = strip(textOf(content));
  return !!text && !text.startsWith("<bash-input>") && !isInjected(text);
}

// Strict UTF-8 like the python reader, so a transcript with one bad byte reads as an error rather than as half a story.
function readEntries(path: string): Entry[] {
  if (!path || !existsSync(path) || statSync(path).size > MAX_TRANSCRIPT_BYTES) return [];
  const text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
  const entries: Entry[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = strip(raw);
    if (!line) continue;
    try {
      const entry: unknown = JSON.parse(line);
      if (isRecord(entry)) entries.push(entry);
    } catch {}
  }
  return entries;
}

const XYZ_LABELS = ["X", "Y", "Z"] as const;
// Horizontal whitespace only: \s would span the newline and let an empty "**X** —" match the next line's text.
const XYZ = Object.fromEntries(
  XYZ_LABELS.map((label) => [
    label,
    new RegExp(
      String.raw`^[ \t]*(?:>[ \t]*)?(?:[-+][ \t]+)?(?:\*\*|__)?${label}(?:\*\*|__)?[ \t]*[—–:-][ \t]*(\S[^\n]*)`,
      "m",
    ),
  ]),
) as Record<(typeof XYZ_LABELS)[number], RegExp>;
const PLACEHOLDERS = ["what i typed", "what i actually expect", "what that forces into existence"];
const HARNESS_ERROR = ["API Error", "Request timed out", "Request was aborted", "Credit balance is too low"];

// A tool-only or interrupted turn has no prose, and a harness error is not the agent speaking.
function isReply(text: string): boolean {
  const body = strip(text || "");
  return !!body && !HARNESS_ERROR.some((prefix) => body.startsWith(prefix));
}

// The first real prose block of a turn; later blocks are mid-turn narration whose opening already passed or was punished.
function replyOpening(blocks: string[]): string | undefined {
  const block = blocks.find(isReply);
  return block ? strip(block) : undefined;
}

// Layout is free; what is enforced is all three labels, X first, in order, and not the template's own placeholder lines.
function xyzGap(text: string): string | undefined {
  const body = text || "";
  const found = XYZ_LABELS.map((label) => XYZ[label].exec(body));
  const missing = XYZ_LABELS.filter((_, i) => !found[i]);
  if (missing.length) return `missing ${missing.join(", ")}`;
  const matches = found as RegExpExecArray[];
  // Measured from whichever label lands first, so a mis-ordered read is reported as mis-ordered, not misplaced.
  if (strip(body.slice(0, Math.min(...matches.map((m) => m.index)))))
    return "not at the start — the read opens the reply, before anything else";
  const rows = matches.map((m) => body.slice(0, m.index).split("\n").length - 1);
  if (rows.some((row, i) => i > 0 && row < (rows[i - 1] ?? 0))) return "out of order — it must read X, then Y, then Z";
  const contents = matches.map((m) => (m[1] ?? "").replace(/[\s*_:.!]+$/, "").toLowerCase());
  if (contents.every((c) => PLACEHOLDERS.includes(c)) && (rows[2] ?? 0) - (rows[0] ?? 0) === 2) {
    return "the template pasted verbatim — each line carries the actual content, not the label's definition";
  }
  return undefined;
}

function assistantContent(entry: Entry, inTurn: boolean): unknown {
  return inTurn && entry.type === "assistant" && !entry.isSidechain ? contentOf(entry) : undefined;
}

// The assistant's visible prose per turn, one string per text block, so the reply's opening block is addressable on its own.
function splitTurnBlocks(entries: Entry[]): string[][] {
  const turns: string[][] = [];
  let current: string[] | undefined;
  for (const entry of entries) {
    if (isGenuineUser(entry)) {
      current = [];
      turns.push(current);
      continue;
    }
    const content = assistantContent(entry, !!current);
    if (typeof content === "string") current?.push(content);
    else if (Array.isArray(content)) {
      for (const item of content)
        if (isRecord(item) && item.type === "text" && item.text) current?.push(str(item.text));
    }
  }
  return turns;
}

function splitTurnTexts(entries: Entry[]): string[] {
  return splitTurnBlocks(entries).map((blocks) => blocks.join("\n"));
}

// What the final turn closes with, the prose after its last tool call: a summary buried mid-body is narration the user skips.
function turnTail(entries: Entry[]): string | undefined {
  let tail: string[] | undefined;
  for (const entry of entries) {
    if (isGenuineUser(entry)) {
      tail = [];
      continue;
    }
    const content = assistantContent(entry, !!tail);
    const items: unknown[] = Array.isArray(content)
      ? content
      : typeof content === "string"
        ? [{ type: "text", text: content }]
        : [];
    for (const item of items) {
      if (!isRecord(item)) continue;
      if (item.type === "tool_use") tail = [];
      else if (item.type === "text" && isReply(str(item.text))) tail?.push(str(item.text));
    }
  }
  return strip((tail ?? []).join("\n")) || undefined;
}

// One zap per turn: a later stop of the same turn, which a task notification re-opens, must not re-judge what was already called out.
function alreadyZapped(entries: Entry[], marker: string): boolean {
  for (const entry of [...entries].reverse()) {
    if (isGenuineUser(entry)) return false;
    const attachment = entry.type === "attachment" ? record(entry.attachment) : {};
    const content = attachment.content ?? "";
    if (
      attachment.type === "hook_system_message" &&
      (typeof content === "string" ? content : JSON.stringify(content)).includes(marker)
    )
      return true;
  }
  return false;
}

// Each turn is the tool calls made after a genuine user message; interjections ride inside tool results and never split one.
function splitTurns(entries: Entry[]): Call[][] {
  const turns: Call[][] = [];
  let current: Call[] | undefined;
  for (const entry of entries) {
    if (isGenuineUser(entry)) {
      current = [];
      turns.push(current);
      continue;
    }
    const content = assistantContent(entry, !!current);
    if (!Array.isArray(content)) continue;
    for (const item of content)
      if (isRecord(item) && item.type === "tool_use" && item.name) current?.push([str(item.name), record(item.input)]);
  }
  return turns;
}

const CREATED = /Task #(\d+) created successfully/;
const ID_LEAD = /^\s*#\d+\s+/;

// Every create and update is in the transcript too, so replaying it survives a wipe, a resume and a fork.
function boardFromTranscript(entries: Entry[]): Task[] {
  // One chronological pass, not creates-then-updates: ids are reused after a wipe, so a stale update would land on the new task.
  const calls = new Map<unknown, Call>();
  const tasks = new Map<string, Task>();
  for (const entry of entries) {
    const content = contentOf(entry);
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!isRecord(item)) continue;
      if (item.type === "tool_use" && BOARD_TOOLS.has(str(item.name))) {
        const args = record(item.input);
        calls.set(item.id, [str(item.name), args]);
        if (item.name !== "TaskUpdate") continue;
        const task = tasks.get(pyStr(args.taskId));
        if (!task) continue;
        if (args.status === "deleted") {
          tasks.delete(String(task.id));
          continue;
        }
        for (const field of ["subject", "status", "owner", "description"]) if (args[field]) task[field] = args[field];
        // Merged, not replaced, and a null key deletes: the replay is written back over a wiped store.
        for (const [key, value] of Object.entries(record(args.metadata))) {
          if (value === null)
            delete record(task.metadata)[key]; // external contract: a null in TaskUpdate metadata deletes the key
          else task.metadata = { ...record(task.metadata), [key]: value };
        }
      } else if (item.type === "tool_result") {
        const [name, args] = calls.get(item.tool_use_id) ?? ["", {}];
        calls.delete(item.tool_use_id);
        if (name !== "TaskCreate") continue;
        const body =
          typeof item.content === "string"
            ? item.content
            : (Array.isArray(item.content) ? item.content : [])
                .filter(isRecord)
                .map((b) => pyStr(b.text ?? ""))
                .join(" ");
        const id = CREATED.exec(body)?.[1];
        if (id) {
          tasks.set(id, {
            id,
            subject: args.subject ?? "",
            description: args.description ?? "",
            status: "pending",
            owner: args.owner ?? "",
            metadata: { ...record(args.metadata) },
          });
        }
      }
    }
  }
  return [...tasks.keys()].sort((a, b) => Number(a) - Number(b)).map((key) => tasks.get(key) as Task);
}

function storeDir(sessionId: string): string {
  return join(configRoot(), "tasks", `session-${sessionId.slice(0, 8)}`);
}

function storeTaskPath(sessionId: string, taskId: string): string {
  return join(storeDir(sessionId), `${taskId}.json`);
}

// Ids are kept: the id counter survives a wipe, so later creates continue above the restored ids and never collide.
function restoreBoard(sessionId: string, tasks: Task[]): void {
  const dir = storeDir(sessionId);
  mkdirSync(dir, { recursive: true });
  for (const task of tasks)
    writeFileSync(join(dir, `${pyStr(task.id)}.json`), pyJson({ blocks: [], blockedBy: [], ...task }, true, 2));
}

function storeBoard(sessionId: string): Task[] {
  const dir = storeDir(sessionId);
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
  return files.flatMap((name) => {
    try {
      const task: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
      return isRecord(task) ? [task] : [];
    } catch {
      return [];
    }
  });
}

// Each store wipe re-creates the receipts under fresh ids, so the replay holds one copy per generation. Newest copy wins.
function dedupeBySubject(tasks: Task[]): Task[] {
  const newest = new Map<string, Task>();
  for (const task of tasks) newest.set(str(task.subject).replace(ID_LEAD, ""), task);
  return [...newest.values()];
}

// Store first, transcript replay as fallback. A caller judging what the user can see uses storeBoard directly.
function loadBoard(sessionId: string, entries?: Entry[]): Task[] {
  const stored = storeBoard(sessionId);
  if (stored.length) return stored;
  return entries?.length ? boardFromTranscript(entries) : [];
}

// Matched by subject minus the id, which the subject only gains after creation.
function lastTouchTurn(turns: Call[][], task: Task): number {
  const taskId = pyStr(task.id);
  const subject = str(task.subject).replace(ID_LEAD, "");
  for (let index = turns.length - 1; index >= 0; index--) {
    for (const [name, args] of turns[index] ?? []) {
      if (name === "TaskUpdate" && pyStr(args.taskId) === taskId) return index;
      if (name === "TaskCreate" && str(args.subject).replace(ID_LEAD, "") === subject) return index;
    }
  }
  return -1;
}

export type TurnShape = {
  written: Set<unknown>;
  delegated: string[];
  mutations: string[];
  boardCalls: string[];
  created: string[];
  createdStartable: string[];
  completed: unknown[];
  question: boolean;
  calls: number;
  firstAction: number;
  firstBoard: number;
  actedFirst: boolean;
  substantial: boolean;
};

const mutates = ([name, args]: Call): boolean => name === "Bash" && MUTATING_SHELL.test(str(args.command));

// What a single turn actually did, in the terms the operating loop cares about.
function turnShape(turn: Call[]): TurnShape {
  const written = new Set(turn.filter(([name]) => WRITE_TOOLS.has(name)).map(([, args]) => args.file_path));
  written.delete(undefined);
  written.delete(null); // external contract: a JSON null file_path counts as no path, as python's None did
  const actions = turn.flatMap((call, i) =>
    WRITE_TOOLS.has(call[0]) || DELEGATE_TOOLS.has(call[0]) || mutates(call) ? [i] : [],
  );
  const boards = turn.flatMap(([name], i) => (BOARD_TOOLS.has(name) ? [i] : []));
  const delegated = turn.filter(([name]) => DELEGATE_TOOLS.has(name)).map(([name]) => name);
  const mutations = turn.filter(mutates).map(([, args]) => str(args.command));
  return {
    written,
    delegated,
    mutations,
    boardCalls: turn.filter(([name]) => BOARD_TOOLS.has(name)).map(([name]) => name),
    created: turn.filter(([name]) => name === "TaskCreate").map(([name]) => name),
    createdStartable: turn
      .filter(([name, args]) => name === "TaskCreate" && !BLOCKED.has(category({ subject: args.subject ?? "" }) ?? ""))
      .map(([, args]) => (args.subject ?? "") as string),
    completed: turn
      .filter(([name, args]) => name === "TaskUpdate" && args.status === "completed")
      .map(([, args]) => args.taskId),
    question: turn.some(([name]) => name === "AskUserQuestion"),
    calls: turn.length,
    firstAction: actions[0] ?? -1,
    firstBoard: boards[0] ?? -1,
    actedFirst: !!actions.length && !!boards.length && (actions[0] ?? 0) < (boards[0] ?? 0),
    // One file, one edit is exempt: a board for a typo fix is ceremony, and crying wolf kills the signal.
    substantial: written.size >= 2 || !!delegated.length || !!mutations.length || (!!written.size && turn.length >= 8),
  };
}

function describeTask(task: Task): string {
  return `#${pyStr(task.id)} ${pyStr(task.subject)}`;
}

function labeled(task: Task): string {
  const subject = str(task.subject);
  return ID_PREFIX.test(subject) ? subject : `#${pyStr(task.id)} ${subject}`;
}

// The client panel truncates around this many items; past it, a rendered list is the only complete view.
const FULL_LIST_OVER = 5;

function boardFull(tasks: Task[]): string {
  const open = tasks.filter((task) => task.status !== "completed");
  const rank = { AI: 0, USER: 1, WAIT: 2 };
  const key = (task: Task): [number, number] => [task.status === "in_progress" ? 0 : 1, rank[category(task) ?? "AI"]];
  const sorted = [...open].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1]);
  return [
    `Board: ${open.length} open`,
    ...sorted.map((task) => labeled(task) + (task.status === "in_progress" ? " — in_progress" : "")),
  ].join("\n");
}

// Id optional: TaskCreate assigns it after the subject is written, so it is checked separately.
const CATEGORY = /^\s*(?:#\d+\s+)?\[(AI|USER|WAIT)\]/i;
const BLOCKED = new Set(["USER", "WAIT"]);
const ID_PREFIX = /^\s*#(\d+)\s+\[(?:AI|USER|WAIT)\]/i;
// Only the id column is padded, since it is what the eye scans by. Three columns carries through #999.
const ID_COLUMN = 3;

function standardPrefix(name: string, taskId: unknown): string {
  return `${`#${pyStr(taskId)}`.padEnd(ID_COLUMN)} [${name.toUpperCase()}] `;
}

function category(task: { subject?: unknown }): Category | undefined {
  const found = CATEGORY.exec(str(task.subject))?.[1];
  return found ? (found.toUpperCase() as Category) : undefined;
}

// Why a subject is not self-identifying, or undefined: a bare id in prose sends the user hunting for what it refers to.
function idGap(task: Task): string | undefined {
  const subject = str(task.subject);
  const match = ID_PREFIX.exec(subject);
  if (!match) return `needs to open with #${pyStr(task.id)}, before the category`;
  if (match[1] !== pyStr(task.id)) return `carries #${match[1]} but its id is #${pyStr(task.id)}`;
  const expected = standardPrefix(category(task) ?? "", task.id);
  return subject.startsWith(expected)
    ? undefined
    : `padding is off — it must read ${quote(expected)} so the ids line up`;
}

// Tasks the agent can move on its own. The category settles it outright; owners only cover boards from before the convention.
function mine(tasks: Task[], turns: Call[][]): Task[] {
  if (tasks.some((task) => category(task))) return tasks.filter((task) => !BLOCKED.has(category(task) ?? ""));
  const ownerOf = new Map<string, unknown>();
  const statuses = new Map<string, Set<unknown>>();
  for (const turn of turns) {
    for (const [name, args] of turn) {
      if (name !== "TaskUpdate") continue;
      const taskId = pyStr(args.taskId);
      if (args.owner) ownerOf.set(taskId, args.owner);
      if (args.status) statuses.set(taskId, (statuses.get(taskId) ?? new Set()).add(args.status));
    }
  }
  const selfOwners = new Set(
    [...ownerOf]
      .filter(([taskId]) => [...(statuses.get(taskId) ?? [])].some((s) => s === "in_progress" || s === "completed"))
      .map(([, owner]) => owner),
  );
  return tasks.filter((task) => !task.owner || selfOwners.has(task.owner));
}

export const Transcript = {
  read: readEntries,
  isGenuineUser,
  contentOf,
  textOf,
  alreadyZapped,
  MUTATING_SHELL,
} as const;
export const Turns = {
  calls: splitTurns,
  blocks: splitTurnBlocks,
  texts: splitTurnTexts,
  tail: turnTail,
  shape: turnShape,
  lastTouch: lastTouchTurn,
} as const;
export const Reply = { real: isReply, opening: replyOpening, xyzGap } as const;
export const Board = {
  fromTranscript: boardFromTranscript,
  store: storeBoard,
  restore: restoreBoard,
  load: loadBoard,
  dedupe: dedupeBySubject,
  taskPath: storeTaskPath,
  full: boardFull,
  describe: describeTask,
  mine,
  FULL_LIST_OVER,
} as const;
export const Subject = {
  category,
  idGap,
  standardPrefix,
  BLOCKED,
  match: (subject: string) => CATEGORY.exec(subject) ?? undefined,
} as const;
