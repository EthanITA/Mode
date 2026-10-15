import { existsSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import type { AskClaudeExchange, AskClaudeReply } from "../../../../shared/types/ask-claude.ts";
import { bare } from "../../models/bare";
import { identityOf, transcriptIndex } from "../transcripts.ts";

export interface AskBlank {
  key: string;
  question: string;
  history: AskClaudeExchange[];
  path?: string;
  signal?: AbortSignal;
}

const READ_ONLY = ["Read", "Glob", "Grep"];
const MAX_TURNS = 8;
const TIMEOUT_MS = 120_000;

function systemOf(canRead: boolean): string {
  const now = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "long" });
  const reach = canRead
    ? "You can read files with Read, Glob and Grep and never change anything, so read what the answer depends on before answering."
    : "You can't read any files, so answer from what is quoted.";
  return (
    `You answer a side question from ${userInfo().username} about code or a document on their machine. ${reach} ` +
    "The numbered lines in the question are what their editor shows, possibly unsaved, so for those lines they win over what Read finds on disk. " +
    'Answer in a few plain sentences with the settling fact first and no headings, because the answer shows in a small card, and say "line N" when you point at a line of the quoted file. ' +
    `~ is ${homedir()}. Now is ${now}.`
  );
}

function promptOf(question: string, history: AskClaudeExchange[]): string {
  if (!history.length) return question;
  const earlier = history.map((one) => `Asked: ${one.question}\n\nAnswered: ${one.response}`).join("\n\n");
  return `Earlier in this side thread:\n\n${earlier}\n\nNow asked: ${question}`;
}

function folderOf(path = ""): string | undefined {
  if (!path) return undefined;
  const folder = dirname(path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
  return existsSync(folder) ? folder : undefined;
}

export async function askBlank({ key, question, history, path, signal }: AskBlank): Promise<AskClaudeReply> {
  const ref = transcriptIndex().get(key);
  const cwd = ref ? identityOf(ref).cwd : undefined;
  // Without the session's folder it reads nothing, because the home folder would be a guess at what it may see.
  const canRead = !!cwd && existsSync(cwd);
  const folder = canRead ? folderOf(path) : undefined;
  try {
    const answer = await bare({
      addDirs: folder ? [folder] : [],
      cwd: canRead ? cwd : undefined,
      maxTurns: MAX_TURNS,
      model: "sonnet",
      prompt: promptOf(question, history),
      signal,
      system: systemOf(canRead),
      timeoutMs: TIMEOUT_MS,
      tools: canRead ? READ_ONLY : [],
    });
    return answer.trim() ? { answered: true, answer: answer.trim() } : { answered: false, message: "Claude gave no answer." };
  } catch (error) {
    return { answered: false, message: (error as Error).message };
  }
}
