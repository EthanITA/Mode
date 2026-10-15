import type { ComputedRef } from "vue";
import type { MascotState } from "~/components/claude/mascot.vue";

type TurnRole = "assistant" | "user" | "system";

export type TurnKind = "thinking" | "narration" | "answer" | "acting" | "note" | "drop" | "done";

export interface ConversationTurn {
  at: number;
  role: TurnRole;
  text: string;
  kind?: TurnKind;
  tool?: string;
  /** The provider's tool_use id, so a result pairs back to its call. */
  ref?: string;
  /** Started with run_in_background, so it is long-running by construction. */
  bg?: true;
  queued?: boolean;
}

const ECHO_MS = 60_000;
const LONG_MS = 10_000;
// Tool calls follow a narration in well under this; a longer silence means the turn ended.
const QUIET_MS = 2_500;

export interface Conversation {
  /** What the mascot acts out: the newest tool call, or thinking while nothing has come back yet. */
  mascot: ComputedRef<MascotState>;
}

interface ConversationSnapshot {
  offset: number;
  turns: ConversationTurn[];
}

function asTurn(value: unknown): ConversationTurn | undefined {
  if (typeof value !== "object" || !value) return undefined;
  if (!("at" in value) || !("role" in value) || !("text" in value)) return undefined;
  const { at, role, text } = value;
  if (typeof at !== "number" || typeof text !== "string") return undefined;
  if (role !== "assistant" && role !== "user" && role !== "system") return undefined;
  const kind = "kind" in value ? value.kind : undefined;
  const tool = "tool" in value ? value.tool : undefined;
  const ref = "ref" in value ? value.ref : undefined;
  return {
    at,
    role,
    text,
    kind: isKind(kind) ? kind : undefined,
    tool: typeof tool === "string" && tool ? tool : undefined,
    ref: typeof ref === "string" && ref ? ref : undefined,
    bg: "bg" in value && value.bg === true ? true : undefined,
    queued: "queued" in value && value.queued === true ? true : undefined,
  };
}

function isKind(value: unknown): value is TurnKind {
  return ["thinking", "narration", "answer", "acting", "note", "drop", "done"].includes(String(value));
}

function parseTurn(raw: string): ConversationTurn | undefined {
  try {
    return asTurn(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function useConversation(): Conversation {
  const sc = useSidecar();
  const { session } = useScreen();

  // Never shown, but a replayed or re-queued turn is only recognised against what already arrived.
  let turns: ConversationTurn[] = [];
  const doing = ref<ConversationTurn>();
  const awaiting = ref(false);
  const wrote = ref(false);
  const long = ref(false);
  const mascot = computed(() =>
    doingOf({
      turn: doing.value,
      awaiting: awaiting.value,
      wrote: wrote.value,
      long: long.value,
    }),
  );
  let ageing: ReturnType<typeof setTimeout> | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const open = new Map<string, number>();

  // Timed from the call's own start and cancelled by its result, so silence in the transcript proves nothing.
  function block(turn: ConversationTurn): void {
    doing.value = turn;
    clearTimeout(ageing);
    clearTimeout(quiet);
    long.value = !!turn.bg;
    const since = turn.ref ? open.get(turn.ref) : undefined;
    if (!long.value && since) {
      ageing = setTimeout(
        () => {
          long.value = true;
        },
        Math.max(0, since + LONG_MS - Date.now()),
      );
    }
    if (turn.kind !== "acting") quiet = setTimeout(settle, QUIET_MS);
  }

  // `long` is deliberately left standing: a call that ran two minutes was long-running.
  function finish(ref?: string): void {
    if (!ref) return;
    open.delete(ref);
    if (ref === doing.value?.ref) clearTimeout(ageing);
  }

  let offset = 0;
  let source: EventSource | undefined;
  let ticket = 0;
  let candidate: ConversationTurn | undefined;

  function disconnect(): void {
    source?.close();
    source = undefined;
  }

  function held(turn: ConversationTurn): boolean {
    if (turns.some((row) => row.at === turn.at && row.role === turn.role && row.text === turn.text)) return true;
    // A re-queued message repeats on a later slice, with replies already between the two copies.
    return (
      turn.role === "user" &&
      turns.some((row) => row.role === "user" && row.text === turn.text && Math.abs(turn.at - row.at) < ECHO_MS)
    );
  }

  // Nothing marks a text block final as it is written, so the newest one stands in until the turn ends.
  function settle(): void {
    doing.value = undefined;
    awaiting.value = false;
    wrote.value = false;
    long.value = false;
    open.clear();
    clearTimeout(ageing);
    clearTimeout(quiet);
    if (!candidate) return;
    turns.push({ ...candidate, kind: "answer" });
    candidate = undefined;
  }

  function append(turn: ConversationTurn): void {
    // A withdrawn or delivered queue entry: drop the pending copy rather than leaving it standing.
    if (turn.kind === "drop") {
      turns = turns.filter((row) => !row.queued || (!!turn.text && row.text !== turn.text));
      return;
    }
    // A tool result carries no words and is not a note: it only reports that the call it names closed.
    if (turn.kind === "done") {
      finish(turn.ref);
      return;
    }
    // The delivered copy replaces the pending one, which is what clears the queued mark.
    if (turn.role === "user" && !turn.queued) {
      const pending = turns.findIndex((row) => row.queued && row.text === turn.text);
      if (pending >= 0) turns.splice(pending, 1);
    }
    if (held(turn)) return;
    if (turn.role === "user") {
      // Queued means the turn it belongs to has not started, so the one in flight must not be settled.
      if (!turn.queued) {
        settle();
        wrote.value = false;
      }
      awaiting.value = true;
      turns.push(turn);
      return;
    }
    // Ahead of every answer mutation below: a compaction lands mid-turn and must not disturb them.
    if (turn.role === "system") {
      if (!echoesNote(turn, turns.at(-1))) turns.push(turn);
      return;
    }
    awaiting.value = false;
    if (turn.kind === "acting") {
      if (turn.ref) open.set(turn.ref, turn.at);
      block(turn);
      if (wroteIn(turn)) wrote.value = true;
      return;
    }
    // Narration detects no state of its own, so it drops the mascot back to thinking.
    if (turn.kind === "narration" || turn.kind === "thinking") {
      block(turn);
      if (turn.kind === "narration") candidate = turn;
      return;
    }
    candidate = undefined;
    doing.value = undefined;
    turns.push(turn);
  }

  function listen(key: string): void {
    disconnect();
    const stream = new EventSource(`/api/sessions/${encodeURIComponent(key)}/stream?since=${offset}`);
    source = stream;
    stream.addEventListener("turn", (event: MessageEvent<string>) => {
      const turn = parseTurn(event.data);
      if (turn) append(turn);
    });
  }

  async function follow(key?: string): Promise<void> {
    const mine = ++ticket;
    disconnect();
    turns = [];
    candidate = undefined;
    doing.value = undefined;
    awaiting.value = false;
    wrote.value = false;
    long.value = false;
    open.clear();
    clearTimeout(ageing);
    offset = 0;
    if (!key) return;
    try {
      const snap = await $fetch<ConversationSnapshot>(`/api/sessions/${encodeURIComponent(key)}/conversation`);
      if (mine !== ticket) return;
      offset = snap.offset;
      for (const row of snap.turns) {
        const turn = asTurn(row);
        if (turn) append(turn);
      }
      // A replay can leave a call dangling on the live-stream timers; settle now so reload skips the flash.
      if (session.value?.status !== "busy") settle();
      listen(key);
    } catch {
      // An unreadable snapshot leaves the mascot at rest rather than acting out a guess.
    }
  }

  onMounted(() => {
    watch(
      () => sc.sessionKey.value,
      (key) => void follow(key),
      { immediate: true },
    );
    // The registry is the only thing that knows the turn is over; a text block never says so itself.
    watch(
      () => session.value?.status,
      (now, before) => {
        if (before === "busy" && now !== "busy") settle();
      },
    );
    onScopeDispose(() => {
      ticket += 1;
      clearTimeout(ageing);
      clearTimeout(quiet);
      disconnect();
    });
  });

  return { mascot };
}
