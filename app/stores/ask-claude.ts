import type { AskClaudeReply, AskClaudeRequest } from "~~/shared/types/ask-claude";
import type { AskClaudeState, AskClaudeTurn } from "~/utils/ask-claude";

interface Thread {
  turns: AskClaudeTurn[];
  shown?: string;
}

export interface AskClaudeView {
  count: number;
  position: number;
  state: AskClaudeState;
  turn?: AskClaudeTurn;
}

// Memory only, like /btw: the side questions never outlive the page.
export const $askClaude = defineStore(() => {
  const threads = ref<Record<string, Thread>>({});
  const inFlight = new Map<string, AbortController>();

  function threadOf(key: string): Thread {
    const fresh: Thread = { turns: [] };
    if (!threads.value[key]) threads.value[key] = fresh;
    return threads.value[key] ?? fresh;
  }

  function view(key?: string): AskClaudeView {
    const thread = key ? threads.value[key] : undefined;
    const turns = thread?.turns ?? [];
    const index = turns.findIndex((turn) => turn.id === thread?.shown);
    const turn = turns[index];
    return { count: turns.length, position: index + 1, state: askClaudeState(turn), turn };
  }

  async function ask(key: string, question: string): Promise<void> {
    if (!question || inFlight.has(key)) return;
    const thread = threadOf(key);
    const history = askClaudeHistory(thread.turns);
    const id = crypto.randomUUID();
    thread.turns.push({ id, question });
    thread.shown = id;
    const abort = new AbortController();
    inFlight.set(key, abort);
    const settle = (patch: Pick<AskClaudeTurn, "answer" | "failure">): void => {
      const turn = thread.turns.find((one) => one.id === id);
      if (turn) Object.assign(turn, patch);
    };
    try {
      const reply = await $fetch<AskClaudeReply>(`/api/sessions/${encodeURIComponent(key)}/ask`, {
        body: { history, kind: "btw", question } satisfies AskClaudeRequest,
        method: "POST",
        signal: abort.signal,
      });
      settle(reply.answered ? { answer: reply.answer } : { failure: reply.message });
    } catch {
      if (!abort.signal.aborted) settle({ failure: "The sidecar could not reach its server." });
    } finally {
      if (inFlight.get(key) === abort) inFlight.delete(key);
    }
  }

  // Hands the question back, so a cancelled ask returns to the field instead of vanishing.
  function cancel(key: string): string | undefined {
    const abort = inFlight.get(key);
    const thread = threads.value[key];
    if (!abort || !thread) return undefined;
    abort.abort();
    inFlight.delete(key);
    const asked = thread.turns.pop();
    thread.shown = undefined;
    return asked?.question;
  }

  function dismiss(key: string): void {
    const thread = threads.value[key];
    if (thread) thread.shown = undefined;
  }

  // Stepping back from a dismissed card reopens the newest answer.
  function step(key: string, by: -1 | 1): void {
    const thread = threads.value[key];
    if (!thread) return;
    const index = thread.turns.findIndex((turn) => turn.id === thread.shown);
    const next = index < 0 ? (by < 0 ? thread.turns.at(-1) : undefined) : thread.turns[index + by];
    if (next) thread.shown = next.id;
  }

  function markSent(key: string, id: string): void {
    const turn = threads.value[key]?.turns.find((one) => one.id === id);
    if (turn) turn.isSent = true;
  }

  return { ask, cancel, dismiss, markSent, step, threads, view };
});
