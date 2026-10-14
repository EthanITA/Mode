import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type { FastModelProvider, FastModelReply, FastModelRequest, FastTask } from "../../../shared/types/models";
import { claudeBinary } from "../sessions/jobs";

const execFileAsync = promisify(execFile);

const SYSTEM_INSTRUCTION =
  "You are a fast editor for a document. For an edit task, return the replacement text for the selection only, keeping the document's register and format, and nothing else. For answer and chat, reply in two or three short sentences.";

const DELEGATE_RULE =
  "When the instruction needs a decision rather than a rewording (the instruction asks you to choose, restructure, add content whose facts you do not have, or the selection is longer than about 1200 characters), answer with exactly the single line DELEGATE and nothing else.";

const HAIKU_SYSTEM_PROMPT = `${SYSTEM_INSTRUCTION} ${DELEGATE_RULE}`;

const TIMEOUT_MS = 60_000;

export interface FormatReplyOptions {
  task: FastTask;
  text: string;
  by: FastModelProvider;
}

interface Run {
  by: FastModelProvider;
  prompt: string;
  system: string;
}

type Result = { type?: string; is_error?: boolean; result?: unknown };
type Failure = Error & { code?: unknown; killed?: boolean; stderr?: string; stdout?: string };

function formatReply({ task, text, by }: FormatReplyOptions): FastModelReply {
  if (task === "edit") {
    return { kind: "edit", replacement: text, by };
  }
  return { kind: "answer", text, by };
}

function isDelegateReply(reply: string): boolean {
  const firstLine = reply
    .split("\n")
    .map((line) => line.trim())
    .find((line) => Boolean(line));
  return firstLine === "DELEGATE";
}

function buildUserMessage(request: FastModelRequest): string {
  const parts: string[] = [`Task: ${request.task}`];
  if (request.context) {
    parts.push(`Surrounding passage:\n"""\n${request.context}\n"""`);
  }
  if (request.selection) {
    parts.push(`Selection:\n"""\n${request.selection}\n"""`);
  }
  parts.push(`Instruction:\n${request.instruction}`);
  return parts.join("\n\n");
}

function promptOf(request: FastModelRequest): string {
  const parts: string[] = [];
  if (request.task === "chat" && request.history && request.history.length > 0) {
    const historyText = request.history
      .map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.text}`)
      .join("\n\n");
    parts.push(`Conversation history:\n${historyText}`);
  }
  parts.push(buildUserMessage(request));
  return parts.join("\n\n");
}

function resultOf(stdout: string): Result {
  try {
    const parsed = JSON.parse(stdout) as Result | Result[];
    // With no setting sources the CLI prints every event as an array, so the answer is its result event.
    return (Array.isArray(parsed) ? parsed.findLast((event) => event.type === "result") : parsed) ?? {};
  } catch {
    return {};
  }
}

// Claude Code's own login answers, so nobody sets an API key, and with no setting sources no CLAUDE.md or plugin steers it.
async function run({ by, prompt, system }: Run): Promise<string> {
  const pending = execFileAsync(
    claudeBinary(),
    [
      "-p",
      "--model",
      by,
      "--tools",
      "",
      "--setting-sources",
      "",
      "--disable-slash-commands",
      "--no-session-persistence",
      "--strict-mcp-config",
      "--settings",
      JSON.stringify({ disableAllHooks: true }),
      "--system-prompt",
      system,
      "--output-format",
      "json",
    ],
    { cwd: tmpdir(), maxBuffer: 16 * 1024 * 1024, timeout: TIMEOUT_MS },
  );
  pending.child.stdin?.end(prompt);
  // A failed run still prints its result event, which carries the reason, such as not being logged in.
  const { stderr, stdout } = await pending.catch((error: Failure) => {
    if (error.code === "ENOENT") throw new Error("Claude Code is not installed");
    if (error.killed) throw new Error(`Claude Code took longer than ${TIMEOUT_MS / 1000}s`);
    return { stderr: error.stderr ?? "", stdout: error.stdout ?? "" };
  });
  const reply = resultOf(stdout);
  if (reply.is_error || typeof reply.result !== "string") {
    // An older Claude Code rejects a flag on stderr and prints no result event at all.
    const said = typeof reply.result === "string" ? reply.result : stderr.trim().split("\n").at(-1);
    throw new Error(said || "Claude Code gave no answer");
  }
  return reply.result;
}

export async function fast(request: FastModelRequest): Promise<FastModelReply> {
  const prompt = promptOf(request);
  const quick = await run({ by: "haiku", prompt, system: HAIKU_SYSTEM_PROMPT }).catch(() => undefined);
  if (quick && !isDelegateReply(quick)) {
    return formatReply({ task: request.task, text: quick, by: "haiku" });
  }

  try {
    const text = await run({ by: "sonnet", prompt, system: SYSTEM_INSTRUCTION });
    return formatReply({ task: request.task, text, by: "sonnet" });
  } catch (error) {
    // The reason goes in message, because h3 strips anything outside ASCII from statusMessage.
    throw createError({
      message: `Claude Code could not answer: ${(error as Error).message}`,
      statusCode: 502,
      statusMessage: "Claude Code could not answer",
    });
  }
}
