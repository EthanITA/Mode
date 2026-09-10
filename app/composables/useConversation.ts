import type { ComputedRef, Ref } from "vue";
import type { MascotState } from "~/components/claude/mascot.vue";
import type { Maybe } from "~/composables/useSidecar";

type TurnRole = "assistant" | "user" | "system";

export type TurnKind = "thinking" | "narration" | "answer" | "acting" | "note" | "drop" | "done";

export interface ConversationTurn {
  at: number;
  role: TurnRole;
  text: string;
  kind?: TurnKind;
  tool?: string;
  arg?: string;
  /** The provider's tool_use id, so a result pairs back to its call. */
  ref?: string;
  /** Started with run_in_background, so it is long-running by construction. */
  bg?: true;
  queued?: boolean;
}

/** One narration and the actions taken under it. A new narration replaces the whole beat. */
export interface Beat {
  /** Absent when the turn opened with a tool call before saying anything. */
  head?: ConversationTurn;
  actions: ConversationTurn[];
}

const ECHO_MS = 60_000;
const LONG_MS = 10_000;
// Tool calls follow a narration in well under this; a longer silence means the turn ended.
const QUIET_MS = 2_500;
const PORT_MS = 2_100;

export interface Conversation {
  /** Reports delivery, so a caller holding state to clear can tell a refusal from a send. */
  deliver: (text: string) => Promise<boolean>;
  draft: Ref<string>;
  error: Maybe<string>;
  live: ComputedRef<boolean>;
  loading: Ref<boolean>;
  send: () => Promise<void>;
  sending: Ref<boolean>;
  /** The live beat: what Claude is saying now and what it has done since saying it. */
  beat: Maybe<Beat>;
  /** What the mascot acts out: the newest tool call, or thinking while nothing has come back yet. */
  mascot: ComputedRef<MascotState>;
  /** True for the length of the hand-over, so both perches open their portal together. */
  porting: Ref<boolean>;
  turns: Ref<ConversationTurn[]>;
}

const REFUSAL = {
  "no-live-session": "This session is not live, so the message was not delivered.",
  "refused-by-inbox": "The session refused the message.",
} as const;

type DeliveryReason = keyof typeof REFUSAL;

type MessageDelivery =
  | { delivered: true; session: string }
  | { delivered: false; reason: DeliveryReason };

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
  const arg = "arg" in value ? value.arg : undefined;
  const ref = "ref" in value ? value.ref : undefined;
  return {
    at, role, text,
    kind: isKind(kind) ? kind : undefined,
    tool: typeof tool === "string" && tool ? tool : undefined,
    arg: typeof arg === "string" && arg ? arg : undefined,
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

function refusalMessage(reason: string): string {
  if (reason === "no-live-session" || reason === "refused-by-inbox") return REFUSAL[reason];
  return "The message was not delivered.";
}

export function useConversation(): Conversation {
  const sc = useSidecar();
  const { session } = useScreen();

  const draft = ref("");
  const error = ref<string>();
  const loading = ref(false);
  const sending = ref(false);
  const turns = ref<ConversationTurn[]>([]);
  const beat = ref<Beat>();
  const doing = ref<ConversationTurn>();
  const awaiting = ref(false);
  const wrote = ref(false);
  const long = ref(false);
  const porting = ref(false);
  const mascot = computed(() => doingOf({
    turn: doing.value,
    awaiting: awaiting.value,
    wrote: wrote.value,
    long: long.value,
  }));
  let ageing: ReturnType<typeof setTimeout> | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let port: ReturnType<typeof setTimeout> | undefined;
  const open = new Map<string, number>();

  // Timed from the call's own start and cancelled by its result, so silence in the transcript proves nothing.
  function block(turn: ConversationTurn): void {
    doing.value = turn;
    clearTimeout(ageing);
    clearTimeout(quiet);
    long.value = !!turn.bg;
    const since = turn.ref ? open.get(turn.ref) : undefined;
    if (!long.value && since) {
      ageing = setTimeout(() => { long.value = true; }, Math.max(0, since + LONG_MS - Date.now()));
    }
    if (turn.kind !== "acting") quiet = setTimeout(settle, QUIET_MS);
  }

  // `long` is deliberately left standing: a call that ran two minutes was long-running.
  function finish(ref?: string): void {
    if (!ref) return;
    open.delete(ref);
    if (ref === doing.value?.ref) clearTimeout(ageing);
  }
  const live = computed(() => !!session.value?.live);

  let offset = 0;
  let source: EventSource | undefined;
  let ticket = 0;
  let candidate: ConversationTurn | undefined;

  watch(() => mascot.value === "idle", () => {
    porting.value = true;
    clearTimeout(port);
    port = setTimeout(() => { porting.value = false; }, PORT_MS);
  });

  function disconnect(): void {
    source?.close();
    source = undefined;
  }

  function held(turn: ConversationTurn): boolean {
    if (turns.value.some((row) => row.at === turn.at && row.role === turn.role && row.text === turn.text)) return true;
    // A re-queued message repeats on a later slice, with replies already between the two copies.
    return turn.role === "user" && turns.value.some((row) => row.role === "user"
      && row.text === turn.text && Math.abs(turn.at - row.at) < ECHO_MS);
  }

  // Nothing marks a text block final as it is written, so the newest one stands in until the turn ends.
  function settle(): void {
    beat.value = undefined;
    doing.value = undefined;
    awaiting.value = false;
    wrote.value = false;
    long.value = false;
    open.clear();
    clearTimeout(ageing);
    clearTimeout(quiet);
    if (!candidate) return;
    turns.value.push({ ...candidate, kind: "answer" });
    candidate = undefined;
  }

  function append(turn: ConversationTurn): void {
    // A withdrawn or delivered queue entry: drop the pending copy rather than leaving it standing.
    if (turn.kind === "drop") {
      turns.value = turns.value.filter((row) => !row.queued || (!!turn.text && row.text !== turn.text));
      return;
    }
    // A tool result carries no words and is not a note: it only reports that the call it names closed.
    if (turn.kind === "done") {
      finish(turn.ref);
      return;
    }
    // The delivered copy replaces the pending one, which is what clears the queued mark.
    if (turn.role === "user" && !turn.queued) {
      const pending = turns.value.findIndex((row) => row.queued && row.text === turn.text);
      if (pending >= 0) turns.value.splice(pending, 1);
    }
    if (held(turn)) return;
    if (turn.role === "user") {
      // Queued means the turn it belongs to has not started, so the one in flight must not be settled.
      if (!turn.queued) {
        settle();
        wrote.value = false;
      }
      awaiting.value = true;
      turns.value.push(turn);
      return;
    }
    // Ahead of every beat and answer mutation below: a compaction lands mid-turn and must not disturb them.
    if (turn.role === "system") {
      if (!echoesNote(turn, turns.value.at(-1))) turns.value.push(turn);
      return;
    }
    awaiting.value = false;
    // Actions belong under whatever narration preceded them, so they append to the open beat.
    if (turn.kind === "acting") {
      if (turn.ref) open.set(turn.ref, turn.at);
      block(turn);
      if (wroteIn(turn)) wrote.value = true;
      // Opens a headless beat when nothing was said first, so the action is never dropped.
      beat.value = { head: beat.value?.head, actions: [...(beat.value?.actions ?? []), turn] };
      return;
    }
    // A new narration replaces the beat outright: its actions were about the last thing said.
    // Narration detects no state of its own, so it drops the mascot back to thinking.
    if (turn.kind === "narration" || turn.kind === "thinking") {
      block(turn);
      beat.value = { head: turn, actions: [] };
      if (turn.kind === "narration") candidate = turn;
      return;
    }
    candidate = undefined;
    beat.value = undefined;
    doing.value = undefined;
    turns.value.push(turn);
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
    turns.value = [];
    candidate = undefined;
    beat.value = undefined;
    doing.value = undefined;
    awaiting.value = false;
    wrote.value = false;
    long.value = false;
    open.clear();
    clearTimeout(ageing);
    error.value = undefined;
    offset = 0;
    if (!key) {
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const snap = await $fetch<ConversationSnapshot>(`/api/sessions/${encodeURIComponent(key)}/conversation`);
      if (mine !== ticket) return;
      offset = snap.offset;
      for (const row of snap.turns) {
        const turn = asTurn(row);
        if (turn) append(turn);
      }
      listen(key);
    } catch (caught) {
      if (mine !== ticket) return;
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      if (mine === ticket) loading.value = false;
    }
  }

  async function deliver(body: string): Promise<boolean> {
    const key = sc.sessionKey.value;
    const text = body.trim();
    if (!key || !text || sending.value) return false;
    if (!live.value) {
      error.value = REFUSAL["no-live-session"];
      return false;
    }
    sending.value = true;
    error.value = undefined;
    try {
      const result = await $fetch<MessageDelivery>(`/api/sessions/${encodeURIComponent(key)}/message`, {
        method: "POST",
        body: { text },
      });
      if (!result.delivered) {
        error.value = refusalMessage(result.reason);
        return false;
      }
      append({ at: Date.now(), role: "user", text });
      return true;
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
      return false;
    } finally {
      sending.value = false;
    }
  }

  async function send(): Promise<void> {
    if (await deliver(draft.value)) draft.value = "";
  }

  onMounted(() => {
    watch(() => sc.sessionKey.value, (key) => void follow(key), { immediate: true });
    // The registry is the only thing that knows the turn is over; a text block never says so itself.
    watch(() => session.value?.status, (now, before) => {
      if (before === "busy" && now !== "busy") settle();
    });
    onScopeDispose(() => {
      ticket += 1;
      clearTimeout(ageing);
      clearTimeout(quiet);
      clearTimeout(port);
      disconnect();
    });
  });

  return { beat, deliver, draft, error, live, loading, mascot, porting, send, sending, turns };
}
