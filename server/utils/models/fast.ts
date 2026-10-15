import type { FastModelProvider, FastModelReply, FastModelRequest, FastTask } from "../../../shared/types/models";
import { bare } from "./bare";

const SYSTEM_INSTRUCTION =
  "You are a fast editor for a document. For an edit task, return the replacement text for the selection only, keeping the document's register and format, and nothing else. For answer and chat, reply in two or three short sentences.";

const DELEGATE_RULE =
  "When the instruction needs a decision rather than a rewording (the instruction asks you to choose, restructure, add content whose facts you do not have, or the selection is longer than about 1200 characters), answer with exactly the single line DELEGATE and nothing else.";

const HAIKU_SYSTEM_PROMPT = `${SYSTEM_INSTRUCTION} ${DELEGATE_RULE}`;

export interface FormatReplyOptions {
  task: FastTask;
  text: string;
  by: FastModelProvider;
}

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

export async function fast(request: FastModelRequest): Promise<FastModelReply> {
  const prompt = promptOf(request);
  const quick = await bare({ model: "haiku", prompt, system: HAIKU_SYSTEM_PROMPT }).catch(() => undefined);
  if (quick && !isDelegateReply(quick)) {
    return formatReply({ task: request.task, text: quick, by: "haiku" });
  }

  try {
    const text = await bare({ model: "sonnet", prompt, system: SYSTEM_INSTRUCTION });
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
