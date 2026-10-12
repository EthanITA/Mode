import type { AskClaudeExchange } from "~~/shared/types/ask-claude";

export type AskClaudeState = "idle" | "asking" | "answered" | "failed";

export interface AskClaudeTurn {
  id: string;
  question: string;
  answer?: string;
  failure?: string;
  isSent?: boolean;
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
    .flatMap((turn) => (turn.answer ? [{ question: turn.question, response: turn.answer }] : []))
    .slice(-HISTORY_MAX);
}

// The TUI habit carries over: `/btw why…` asks the same as `why…`.
export function askClaudeQuestion(draft: string): string {
  return draft.replace(/^\s*\/btw\b/, "").trim();
}
