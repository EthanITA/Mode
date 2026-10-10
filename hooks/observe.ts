import * as Artifacts from "../lib/artifact/store.ts";
import { newsLine } from "../lib/hook/board.ts";
import { context, payload, record, str, type Payload } from "../lib/hook/io.ts";
import { deliverableCommand } from "../lib/mode/deliverable.ts";
import { done } from "../lib/mode/slots.ts";

const TESTS =
  /\b(pytest|py\.test|jest|vitest|mocha|rspec|phpunit|tox|nose2|node\s+--test|python3?\s+(-m\s+unittest|\S*tests?\/\S+\.py|\S*test_\S+\.py)|(go|cargo|mvn|gradle|swift|dotnet)\s+test|(npm|yarn|pnpm|bun|deno)\s+(run\s+)?test|tests?\/run\.py|make\s+(test|check))\b/;
// A pipe exits with its last command's status, so a red suite piped into tail only shows red in what it printed.
const RED = /\bFAIL(?:ED|URE)?\b|\b[1-9]\d* (?:\w+ )?(?:failed|failures?|errors?)\b|^[ℹ#] fail [1-9]/m;
// A suite that could not load is broken rather than red, and a red-first gate must not open on it.
const UNLOADED =
  /ModuleNotFoundError|ImportError|SyntaxError|IndentationError|NameError|error during collection|Cannot find module/;
const COMMIT = /\bgit\s+(?:-[Cc]\s+\S+\s+|--?[\w-]+(?:=\S+)?\s+)*(commit|cherry-pick)\b/;
const NOT_COMMITTED = /nothing (?:added )?to commit|no changes added to commit/;
// The two delivery acts that finish one part of the north star outright: the MR opened, the page stamped.
const RECEIPTS: [RegExp, string][] = [
  [/\b(?:glab\s+mr\s+create|gh\s+pr\s+create)\b/, "change"],
  [/\bartifact\s+stamp\b/, "artifact"],
];
const MR_TOOL = /^mcp__.+__create_(?:merge_request|pull_request)$/;
// Only at the top of the folder: a .md one level down is a page's build brief, not an artifact.
const ARTIFACT_MD = /\/artifacts\/[^/]+\.md$/;

// Each step stands alone, the way it did when each was its own process: one failing never stops the next.
async function quietly(step: () => unknown): Promise<void> {
  try {
    await step();
  } catch {}
}

// The step event a tool call just satisfied, read off the call rather than off a claim.
function observed(data: Payload): string {
  const tool = str(data.tool_name);
  const args = record(data.tool_input);
  const failed = data.hook_event_name === "PostToolUseFailure";
  if (tool === "AskUserQuestion") return failed ? "" : "question";
  if (tool === "Agent") return failed ? "" : "agent";
  if (tool === "Artifact") return failed ? "" : "artifact";
  if (["Write", "Edit", "NotebookEdit"].includes(tool)) {
    const path = str(args.file_path);
    const made = path.includes("/artifacts/") && (path.endsWith(".html") || ARTIFACT_MD.test(path));
    return !failed && made ? "artifact" : "";
  }
  if (tool !== "Bash") return "";
  const command = str(args.command);
  const response = record(data.tool_response);
  const printed = failed ? str(data.error) : `${str(response.stdout)}\n${str(response.stderr)}`;
  if (COMMIT.test(command)) return failed || NOT_COMMITTED.test(printed) ? "" : "commit";
  if (!TESTS.test(command)) return "";
  const red = failed || RED.test(printed);
  // A suite that went red is its own event, which is what a red-first pipeline waits on.
  if (red) return UNLOADED.test(printed) ? "" : "test-fail";
  return "test";
}

// lib/artifact is the one writer of a conversation's list, as lib/mode is of its slots.
function recordDocument(data: Payload): void {
  const path = str(record(data.tool_input).file_path);
  const session = str(data.session_id);
  if (data.hook_event_name !== "PostToolUse" || !["Write", "Edit"].includes(str(data.tool_name))) return;
  if (!path.endsWith(".md") || !session) return;
  try {
    Artifacts.record(Artifacts.entryOf(Artifacts.resolve(path, session)), session);
  } catch {}
}

// Write reports `create` only for a file that did not exist, so a rewrite of a page is never announced twice.
function announceCreated(data: Payload): void {
  if (data.hook_event_name !== "PostToolUse" || str(data.tool_name) !== "Write") return;
  if (str(record(data.tool_response).type) !== "create") return;
  Artifacts.announce(str(record(data.tool_input).file_path), str(data.session_id));
}

try {
  const data = payload() ?? {};
  const session = str(data.session_id) || undefined;
  const token = observed(data);
  if (token) await quietly(() => done({ axis: "mode", session, reason: token }));
  recordDocument(data);
  await quietly(() => announceCreated(data));

  if (data.hook_event_name === "PostToolUse" && !data.agent_id) {
    const command = data.tool_name === "Bash" ? str(record(data.tool_input).command) : "";
    const parts = RECEIPTS.filter(([pattern]) => pattern.test(command)).map(([, part]) => part);
    if (MR_TOOL.test(str(data.tool_name))) parts.push("change");
    for (const part of parts) await quietly(() => deliverableCommand({ words: ["done", part], session }));
  }

  // Only on the success event: a failed call already owes the model an error, not a board aside.
  if (data.hook_event_name === "PostToolUse") {
    const board = newsLine(str(data.session_id));
    if (board) context("PostToolUse", board);
  }
} catch {}
