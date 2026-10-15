export interface AskClaudeExchange {
  question: string;
  response: string;
}

interface AskClaudeAsked {
  question: string;
  history: AskClaudeExchange[];
}

// Blank is a bare Claude that may only read files, and btw is /btw's fork of the whole conversation with no tools.
export type AskClaudeRequest = (AskClaudeAsked & { kind: "blank"; path?: string }) | (AskClaudeAsked & { kind: "btw" });

export type AskClaudeReply = { answered: true; answer: string } | { answered: false; message: string };
