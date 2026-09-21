import type { MaybeRefOrGetter } from "vue";
import type { BoardAction, BoardSummary, BoardTask } from "~~/shared/types/board";
import type { Maybe } from "./useSidecar";

const REFRESH_MS = 5000;

export interface Board {
  summary: Maybe<BoardSummary>;
  toggleDone: (task: BoardTask) => Promise<void>;
  reassign: (task: BoardTask, owner: string) => Promise<void>;
  addTask: (text: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
}

export function useBoard(key: MaybeRefOrGetter<string | undefined>): Board {
  const summary = ref<BoardSummary>();

  async function pull(): Promise<void> {
    const value = toValue(key);
    if (!value) return;
    try {
      summary.value = await $fetch<BoardSummary>(`/api/sessions/${value}/board`);
    } catch {
      // a transient read failure keeps the last good board rather than blanking it
    }
  }

  // Never through the chat: the board hooks tell the agent, so this costs it no turn.
  async function act(action: BoardAction): Promise<void> {
    const value = toValue(key);
    if (!value) return;
    try {
      summary.value = await $fetch<BoardSummary>(`/api/sessions/${value}/board`, {
        method: "POST",
        body: action,
      });
    } catch {
      await pull();
    }
  }

  onMounted(() => {
    void pull();
    const timer = window.setInterval(() => void pull(), REFRESH_MS);
    onScopeDispose(() => window.clearInterval(timer));
  });

  watch(() => toValue(key), pull);

  return {
    summary,
    toggleDone: (task) => act({ kind: "done", id: task.id, done: !task.done }),
    reassign: (task, owner) => act({ kind: "owner", id: task.id, owner }),
    addTask: (text) => act({ kind: "add", text }),
    reorder: (ids) => act({ kind: "order", ids }),
  };
}
