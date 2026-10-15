import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { AskClaudeExchange, AskClaudeReply } from "../../../../shared/types/ask-claude.ts";
import { claudeBinary } from "../jobs.ts";
import { forkable, identityOf, transcriptIndex } from "../transcripts.ts";

export interface AskBtw {
  key: string;
  question: string;
  history: AskClaudeExchange[];
  signal?: AbortSignal;
}

interface Fork {
  cwd: string;
  build: string;
  history: AskClaudeExchange[];
  model?: string;
  path: string;
  question: string;
  signal?: AbortSignal;
  version?: string;
}

const TIMEOUT_MS = 120_000;
const VERSION = /^\d+\.\d+\.\d+$/;

function failed(message: string): AskClaudeReply {
  return { answered: false, message };
}

// The build that wrote the transcript speaks its protocol and carries its system prompt, so the fork matches the session.
function buildOf(version?: string): string {
  const pinned =
    version && VERSION.test(version) ? join(homedir(), ".local", "share", "claude", "versions", version) : "";
  return pinned && existsSync(pinned) ? pinned : claudeBinary();
}

function refusal(error: string, version?: string): string {
  if (/side_question/.test(error) && /not supported|unsupported|unknown/i.test(error)) {
    return `This session runs Claude Code ${version || "of an older build"}, which can't answer side questions. Update Claude Code, then ask again.`;
  }
  return `Claude Code refused the side question: ${error}`;
}

type Frame = { id: string; body: Record<string, unknown> } | { id: string; error: string };

function frameOf(line: string): Frame | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  const frame = value as { type?: unknown; response?: Record<string, unknown> };
  const response = frame.response;
  if (frame.type !== "control_response" || !response || typeof response.request_id !== "string") return undefined;
  if (response.subtype === "error")
    return { id: response.request_id, error: String(response.error || "unknown error") };
  return { id: response.request_id, body: (response.response as Record<string, unknown>) || {} };
}

// stream-json takes control requests on stdin: initialize first, then the side question that /btw sends.
function converse({ cwd, build, history, model, path, question, signal, version }: Fork): Promise<AskClaudeReply> {
  return new Promise((resolve) => {
    const args = [
      "-p",
      "--resume",
      path,
      "--fork-session",
      "--no-session-persistence",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--settings",
      JSON.stringify({ disableAllHooks: true }),
      ...(model ? ["--model", model] : []),
    ];
    const child = spawn(build, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let settled = false;
    let stdout = "";
    let stderr = "";

    const finish = (reply: AskClaudeReply): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      child.stdin.end();
      child.kill();
      resolve(reply);
    };
    const cancel = (): void => finish(failed("Cancelled before Claude answered."));
    const timer = setTimeout(
      () => finish(failed("Claude took more than two minutes, so the side question was dropped.")),
      TIMEOUT_MS,
    );
    const send = (id: string, request: Record<string, unknown>): void => {
      child.stdin.write(`${JSON.stringify({ type: "control_request", request_id: id, request })}\n`);
    };

    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) return cancel();
    // A child that dies first turns the next write into EPIPE, which the exit handler already reports.
    child.stdin.on("error", () => {});
    child.on("error", (error) => finish(failed(`Claude Code could not start: ${error.message}`)));
    child.on("exit", (code) => {
      const last = stderr.trim().split("\n").at(-1);
      finish(failed(last || `Claude Code exited with code ${code} before answering.`));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      let at = stdout.indexOf("\n");
      for (; at >= 0; at = stdout.indexOf("\n")) {
        const frame = frameOf(stdout.slice(0, at));
        stdout = stdout.slice(at + 1);
        if (!frame) continue;
        if ("error" in frame) return finish(failed(refusal(frame.error, version)));
        if (frame.id === "init") send("ask", { subtype: "side_question", question, history });
        if (frame.id !== "ask") continue;
        const answer = typeof frame.body.response === "string" ? frame.body.response.trim() : "";
        // A synthetic reply is the build's placeholder for no answer, never something Claude said.
        return finish(
          answer && frame.body.synthetic !== true
            ? { answered: true, answer }
            : failed(answer || "Claude gave no answer."),
        );
      }
    });
    send("init", { subtype: "initialize" });
  });
}

export async function askBtw({ key, question, history, signal }: AskBtw): Promise<AskClaudeReply> {
  const ref = transcriptIndex().get(key);
  if (!ref) return failed("This conversation has no transcript on disk, so there is nothing to ask about.");
  const fork = forkable(await readFile(ref.path, "utf8"));
  if (!fork) return failed("The transcript has no messages yet, so there is nothing to ask about.");
  const cwd = identityOf(ref).cwd;
  const path = join(tmpdir(), `${randomUUID()}.jsonl`);
  await writeFile(path, fork.text, { mode: 0o600 });
  try {
    return await converse({
      cwd: cwd && existsSync(cwd) ? cwd : homedir(),
      build: buildOf(fork.version),
      history,
      model: fork.model,
      path,
      question,
      signal,
      version: fork.version,
    });
  } finally {
    await rm(path, { force: true });
  }
}
