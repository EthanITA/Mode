import type { AskClaudeReply, AskClaudeRequest } from "~~/shared/types/ask-claude";
import type { AskClaudeTurn, SideAnchor, SideSurface, SideThread } from "~/utils/ask-claude";

export type SideDelivery = { delivered: true } | { delivered: false; reason: "no-live-session" | "refused-by-inbox" };

export interface SideAsk {
  anchor: SideAnchor;
  key: string;
  question: string;
}

// Memory only, like /btw, and a fetch outlives the card that started it, so an answer waits for you to come back.
export const $sideQuestion = defineStore(() => {
  const threads = ref<SideThread[]>([]);
  const inFlight = new Map<string, AbortController>();
  const sending = new Set<string>();
  let focusNext: string | undefined;

  function find(id: string): SideThread | undefined {
    return threads.value.find((one) => one.id === id);
  }

  function at(key: string | undefined, surface: SideSurface, place: string): SideThread[] {
    return threads.value.filter(
      (one) => one.key === key && one.anchor.surface === surface && one.anchor.place === place,
    );
  }

  async function run(thread: SideThread, turn: AskClaudeTurn): Promise<void> {
    const history = askClaudeHistory(thread.turns.filter((one) => one.id !== turn.id));
    const abort = new AbortController();
    inFlight.set(thread.id, abort);
    const settle = (patch: Pick<AskClaudeTurn, "answer" | "failure">): void => {
      const live = find(thread.id)?.turns.find((one) => one.id === turn.id);
      if (live) Object.assign(live, patch);
    };
    try {
      const reply = await $fetch<AskClaudeReply>(`/api/sessions/${encodeURIComponent(thread.key)}/ask`, {
        body: {
          history,
          kind: "blank",
          path: thread.anchor.path,
          question: turn.prompt ?? turn.question,
        } satisfies AskClaudeRequest,
        method: "POST",
        signal: abort.signal,
      });
      settle(reply.answered ? { answer: reply.answer } : { failure: reply.message });
    } catch {
      if (!abort.signal.aborted) settle({ failure: "The sidecar could not reach its server." });
    } finally {
      if (inFlight.get(thread.id) === abort) inFlight.delete(thread.id);
    }
  }

  function push(thread: SideThread, question: string): void {
    const turn: AskClaudeTurn = { id: crypto.randomUUID(), question };
    if (!thread.turns.length) turn.prompt = SideQuestion.promptOf(thread.anchor, question);
    thread.turns.push(turn);
    const live = thread.turns.at(-1);
    if (live) void run(thread, live);
  }

  function ask({ anchor, key, question }: SideAsk): string {
    const id = crypto.randomUUID();
    threads.value.push({ anchor, draft: "", id, key, status: "open", turns: [] });
    const thread = find(id);
    if (thread) push(thread, question);
    focusNext = id;
    return id;
  }

  function follow(id: string, question: string): void {
    const thread = find(id);
    if (!thread || !question || inFlight.has(id)) return;
    thread.draft = "";
    push(thread, question);
  }

  function retry(id: string): void {
    const thread = find(id);
    const failed = thread?.turns.at(-1);
    if (!thread || !failed?.failure || inFlight.has(id)) return;
    thread.turns.pop();
    push(thread, failed.question);
  }

  // The question goes back into the field, the way a cancelled Ask Claude does.
  function stop(id: string): void {
    const thread = find(id);
    const abort = inFlight.get(id);
    if (!thread || !abort) return;
    abort.abort();
    inFlight.delete(id);
    thread.draft = thread.turns.pop()?.question ?? thread.draft;
  }

  // Refused while Claude answers: an aborted turn never settles, so an Undo would bring back a card stuck asking.
  function resolve(id: string): void {
    const thread = find(id);
    if (thread && !inFlight.has(id)) thread.status = "resolved";
  }

  function undo(id: string): void {
    const thread = find(id);
    if (thread?.status === "resolved") thread.status = "open";
  }

  // Undefined is a refusal, which says nothing, while a network failure says it never left.
  async function send(id: string): Promise<SideDelivery | "unreachable" | undefined> {
    const thread = find(id);
    if (!thread || thread.status !== "open" || inFlight.has(id) || sending.has(id)) return undefined;
    sending.add(id);
    try {
      const reply = await $fetch<SideDelivery>(`/api/sessions/${encodeURIComponent(thread.key)}/message`, {
        body: { text: SideQuestion.handoverOf(thread) },
        method: "POST",
      });
      if (reply.delivered) thread.status = "sent";
      return reply;
    } catch {
      return "unreachable";
    } finally {
      sending.delete(id);
    }
  }

  // Open threads survive leaving the place, so a slow answer is there when you come back; settled ones go.
  function leave(key: string | undefined, surface: SideSurface, place: string): void {
    const settled = new Set(at(key, surface, place).filter((one) => one.status !== "open"));
    if (settled.size) threads.value = threads.value.filter((one) => !settled.has(one));
  }

  function claimFocus(id: string): boolean {
    if (focusNext !== id) return false;
    focusNext = undefined;
    return true;
  }

  return { ask, at, claimFocus, follow, leave, resolve, retry, send, stop, threads, undo };
});
