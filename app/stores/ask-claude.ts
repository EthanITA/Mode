import type { AskClaudeReply, AskClaudeRequest } from "~~/shared/types/ask-claude";
import type { AskClaudeState, AskClaudeTurn } from "~/utils/ask-claude";

export interface AskClaudeView {
  state: AskClaudeState;
  turns: AskClaudeTurn[];
}

// Memory only, like /btw: the side questions never outlive the page.
export const $askClaude = defineStore(() => {
  const threads = ref<Record<string, AskClaudeTurn[]>>({});
  const inFlight = new Map<string, AbortController>();

  function view(key?: string): AskClaudeView {
    const turns = (key && threads.value[key]) || [];
    return { state: askClaudeState(turns.at(-1)), turns };
  }

  async function ask(key: string, question: string): Promise<void> {
    if (!question || inFlight.has(key)) return;
    const turns = threads.value[key] ?? [];
    threads.value[key] = turns;
    const history = askClaudeHistory(turns);
    const id = crypto.randomUUID();
    turns.push({ id, question });
    const abort = new AbortController();
    inFlight.set(key, abort);
    const settle = (patch: Pick<AskClaudeTurn, "answer" | "failure">): void => {
      const turn = threads.value[key]?.find((one) => one.id === id);
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
    if (!abort) return undefined;
    abort.abort();
    inFlight.delete(key);
    return threads.value[key]?.pop()?.question;
  }

  // Returns what went, so the toast's Undo can put it back.
  function clear(key: string): AskClaudeTurn[] {
    inFlight.get(key)?.abort();
    inFlight.delete(key);
    const gone = threads.value[key] ?? [];
    delete threads.value[key];
    return gone.filter((turn) => askClaudeState(turn) !== "asking");
  }

  function restore(key: string, turns: AskClaudeTurn[]): void {
    threads.value[key] = [...turns, ...(threads.value[key] ?? [])];
  }

  function markSent(key: string, id: string): void {
    const turn = threads.value[key]?.find((one) => one.id === id);
    if (turn) turn.isSent = true;
  }

  return { ask, cancel, clear, markSent, restore, threads, view };
});
