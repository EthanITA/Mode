import type { MaybeRefOrGetter } from "vue";
import type { BoardSummary, BoardTask } from "~~/shared/types/board";
import type { Maybe } from "./useSidecar";

const REFRESH_MS = 5000;

export interface Board {
  summary: Maybe<BoardSummary>;
  toggleDone: (task: BoardTask) => Promise<void>;
  reassign: (task: BoardTask, owner: string) => Promise<void>;
  addTask: (text: string) => Promise<void>;
  reorder: (task: BoardTask, beforeId?: string) => Promise<void>;
}

export function useBoard(key: MaybeRefOrGetter<string | undefined>): Board {
  const summary = ref<BoardSummary>();
  const bridge = useActionBridge();

  async function pull(): Promise<void> {
    const value = toValue(key);
    if (!value) return;
    try {
      summary.value = await $fetch<BoardSummary>(`/api/sessions/${value}/board`);
    } catch {
      // a transient read failure keeps the last good board rather than blanking it
    }
  }

  // Writes never touch the task files directly: that would race the live session's own
  // task tool, so every write goes through the action bridge's message channel instead.
  async function send(text: string): Promise<void> {
    await bridge.say(text);
    await pull();
  }

  onMounted(() => {
    void pull();
    const timer = window.setInterval(() => void pull(), REFRESH_MS);
    onScopeDispose(() => window.clearInterval(timer));
  });

  watch(() => toValue(key), pull);

  return {
    summary,
    toggleDone: (task) => send(`Mark task #${task.id} as ${task.done ? "not done" : "done"} on the board.`),
    reassign: (task, owner) => send(`Reassign task #${task.id} on the board to ${owner}.`),
    addTask: (text) => send(`Add a new task to the board: "${text}"`),
    reorder: (task, beforeId) =>
      send(
        beforeId
          ? `Reorder the board: move task #${task.id} to sit just before task #${beforeId}.`
          : `Reorder the board: move task #${task.id} to the end.`,
      ),
  };
}
