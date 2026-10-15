import type { Node } from "comark";
import type { AskClaudeExchange } from "~~/shared/types/ask-claude";
import type { LineSpan } from "./monaco/notes";

export type AskClaudeState = "idle" | "asking" | "answered" | "failed";

export interface AskClaudeTurn {
  id: string;
  question: string;
  answer?: string;
  failure?: string;
  isSent?: boolean;
  prompt?: string;
}

// The same window /btw replays, so a follow-up can lean on what was asked before.
const HISTORY_MAX = 20;

export function askClaudeState(turn?: AskClaudeTurn): AskClaudeState {
  if (!turn) return "idle";
  if (turn.failure) return "failed";
  return turn.answer ? "answered" : "asking";
}

export function askClaudeHistory(turns: AskClaudeTurn[]): AskClaudeExchange[] {
  return turns
    .flatMap((turn) => (turn.answer ? [{ question: turn.prompt ?? turn.question, response: turn.answer }] : []))
    .slice(-HISTORY_MAX);
}

export type SideSurface = "artifact" | "files" | "review";

export interface SideAnchor {
  surface: SideSurface;
  place: string;
  label: string;
  where: string;
  quote: string;
  lines?: LineSpan;
  mark?: string;
  path?: string;
  block?: string;
  top?: number;
}

export type SideStatus = "open" | "resolved" | "sent";

export interface SideThread {
  id: string;
  key: string;
  anchor: SideAnchor;
  turns: AskClaudeTurn[];
  status: SideStatus;
  draft: string;
}

export type SideQuestionState =
  "empty" | "asking" | "answered" | "followup" | "thread" | "failed" | "resolved" | "sent";

interface LineRef {
  lines: LineSpan;
  text: string;
}

// The session can read the file itself, so a handover quotes only enough to find the spot, as the tray does.
const QUOTE_MAX = 160;
const LINE_REF = /\blines?\s+(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/gi;
const ELSEWHERE = /^\s*(?:of|in)\s+[`"']?((?:~?\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[A-Za-z0-9]+)/;
const VERBATIM = new Set(["code", "pre"]);

function stateOf({ status, turns }: SideThread): SideQuestionState {
  if (status !== "open") return status;
  const last = turns.at(-1);
  if (!last) return "empty";
  if (last.failure) return "failed";
  if (!last.answer) return turns.length > 1 ? "followup" : "asking";
  return turns.length > 1 ? "thread" : "answered";
}

// Numbered, so a "line 14" in the answer means the file's line 14 and lights the right row.
function promptOf(anchor: SideAnchor, question: string): string {
  const [first = 1] = anchor.lines ?? [];
  const rows = anchor.quote.split("\n");
  const width = String(first + rows.length - 1).length;
  const picked = anchor.lines
    ? `\`\`\`\n${rows.map((row, at) => `${String(first + at).padStart(width)}  ${row}`).join("\n")}\n\`\`\``
    : rows.map((row) => `> ${row}`).join("\n");
  return `About ${anchor.where}:\n\n${picked}\n\n${question}`;
}

// Claude cross-references other files, and "line 88 of guard.ts" must not light line 88 of this one.
function isElsewhere(after: string, file: string): boolean {
  const named = ELSEWHERE.exec(after)?.[1];
  return !!named && named.split("/").at(-1) !== file;
}

function refsIn(text: string, file: string, next = ""): Array<string | LineRef> {
  const out: Array<string | LineRef> = [];
  let last = 0;
  for (const match of text.matchAll(LINE_REF)) {
    const end = match.index + match[0].length;
    if (isElsewhere(text.slice(end) + next, file)) continue;
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push({ lines: [Math.min(from, to), Math.max(from, to)], text: match[0] });
    last = end;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function linesNamed(file: string, answer?: string): LineSpan[] {
  if (!answer) return [];
  return refsIn(answer, file).flatMap((part) => (typeof part === "string" ? [] : [part.lines]));
}

function textOf(node?: Node): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  const [, , ...children] = node;
  return children.map((child) => textOf(child as Node)).join("");
}

// Text nodes only, so a ref inside a code span or a fence stays code.
function withLineRefs(nodes: Node[], file: string): Node[] {
  return nodes.flatMap((node, at): Node[] => {
    if (typeof node === "string") {
      return refsIn(node, file, textOf(nodes[at + 1])).map((part) =>
        typeof part === "string" ? part : ["line-ref", { from: part.lines[0], to: part.lines[1] }, part.text],
      );
    }
    const [tag, attrs, ...children] = node;
    if (!tag || VERBATIM.has(tag)) return [node];
    return [[tag, attrs, ...withLineRefs(children as Node[], file)]];
  });
}

function handoverOf({ anchor, draft, turns }: SideThread): string {
  const quote = anchor.quote.replace(/\s+/g, " ").trim();
  const short = quote.length > QUOTE_MAX ? `${quote.slice(0, QUOTE_MAX - 1)}…` : quote;
  const exchanges = turns.flatMap((turn) =>
    turn.answer ? [`I asked: ${turn.question}`, `Claude answered: ${turn.answer}`] : [],
  );
  // The side Claude never saw this conversation, so the session must not read its answer as its own.
  const thread = [`I asked a blank Claude on the side about ${anchor.where} (“${short}”).`, ...exchanges].join("\n");
  return draft.trim() ? `${thread}\n\n${draft.trim()}` : thread;
}

export const SideQuestion = { handoverOf, linesNamed, promptOf, stateOf, withLineRefs };

// The TUI habit carries over: `/btw why…` asks the same as `why…`.
export function askClaudeQuestion(draft: string): string {
  return draft.replace(/^\s*\/btw\b/, "").trim();
}
