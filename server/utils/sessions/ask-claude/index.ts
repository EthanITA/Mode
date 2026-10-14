import type { AskClaudeReply, AskClaudeRequest } from "../../../../shared/types/ask-claude.ts";
import { askBlank } from "./blank";
import { askBtw } from "./btw";

export type AskClaudeOptions = AskClaudeRequest & { key: string; signal?: AbortSignal };

function assertNever(value: never): never {
  throw new Error(`unhandled ${JSON.stringify(value)}`);
}

export function askClaude(options: AskClaudeOptions): Promise<AskClaudeReply> {
  switch (options.kind) {
    case "blank":
      return askBlank(options);
    case "btw":
      return askBtw(options);
    default:
      return assertNever(options);
  }
}
