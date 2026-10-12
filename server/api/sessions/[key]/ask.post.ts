import { askClaude } from "~~/server/utils/sessions/ask-claude";
import type { AskClaudeExchange, AskClaudeReply, AskClaudeRequest } from "~~/shared/types/ask-claude";

// The newest twenty, the same window /btw replays, so a follow-up can lean on what was asked before.
const HISTORY_MAX = 20;

function isExchange(value: unknown): value is AskClaudeExchange {
  const record = value as Record<string, unknown> | undefined;
  return typeof record?.question === "string" && typeof record.response === "string";
}

function requestOf(raw: unknown): AskClaudeRequest | undefined {
  const record = raw as Record<string, unknown> | undefined;
  const question = typeof record?.question === "string" ? record.question.trim() : "";
  const history = record?.history ?? [];
  if (!question || !Array.isArray(history) || !history.every(isExchange)) return undefined;
  return { question, history: history.slice(-HISTORY_MAX) };
}

export default defineEventHandler(async (event): Promise<AskClaudeReply> => {
  const key = getRouterParam(event, "key") || "";
  const request = requestOf(await readBody(event));
  if (!key || !request) throw createError({ statusCode: 400, statusMessage: "Invalid request body" });
  // A closed tab or a cancel drops the connection, which is the only signal the fork is no longer wanted.
  const abort = new AbortController();
  event.node.res.on("close", () => abort.abort());
  return askClaude({ key, ...request, signal: abort.signal });
});
