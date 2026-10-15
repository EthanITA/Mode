import type { MascotState } from "~/components/claude/mascot.vue";
import type { ConversationTurn } from "~/composables/useConversation";

const WRITE = new Set(["Write", "Edit", "NotebookEdit"]);
const OFFLOAD = new Set(["Agent", "Task", "Workflow"]);

export type Doing = {
  /** The newest assistant block of any kind, not only tool calls. */
  turn?: ConversationTurn;
  /** Asked, nothing back yet. */
  awaiting?: boolean;
  wrote?: boolean;
  /** The open call is genuinely long-running: backgrounded, or outstanding past the threshold. */
  long?: boolean;
};

export function doingOf({ turn, awaiting, wrote, long }: Doing): MascotState {
  if (awaiting) return "thinking";
  if (!turn) return "idle";
  const tool = turn.kind === "acting" ? turn.tool : undefined;
  if (!tool) return "thinking";

  if (tool.startsWith("mcp__") || OFFLOAD.has(tool)) return "running";
  if (tool === "Bash" && long) return "running";
  if (WRITE.has(tool)) return "coding";
  // Once it has written, reading is part of the same job rather than a fresh investigation.
  if (wrote) return "coding";
  return "investigating";
}

export function wroteIn(turn?: ConversationTurn): boolean {
  return turn?.kind === "acting" && !!turn.tool && WRITE.has(turn.tool);
}
