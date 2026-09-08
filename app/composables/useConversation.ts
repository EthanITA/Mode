import type { ComputedRef, Ref } from "vue";
import type { Maybe } from "~/composables/useSidecar";

type TurnRole = "assistant" | "user";

export interface ConversationTurn {
  at: number;
  role: TurnRole;
  text: string;
}

export interface Conversation {
  /** Reports delivery, so a caller holding state to clear can tell a refusal from a send. */
  deliver: (text: string) => Promise<boolean>;
  draft: Ref<string>;
  error: Maybe<string>;
  live: ComputedRef<boolean>;
  loading: Ref<boolean>;
  send: () => Promise<void>;
  sending: Ref<boolean>;
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
  if (role !== "assistant" && role !== "user") return undefined;
  return { at, role, text };
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
  const live = computed(() => !!session.value?.live);

  let offset = 0;
  let source: EventSource | undefined;
  let ticket = 0;

  function disconnect(): void {
    source?.close();
    source = undefined;
  }

  function append(turn: ConversationTurn): void {
    if (turns.value.some((row) => row.at === turn.at && row.role === turn.role && row.text === turn.text)) return;
    const last = turns.value.at(-1);
    // send already painted this; the stream echo is the same words with a later stamp
    if (turn.role === "user" && last?.role === "user" && last.text === turn.text) return;
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
      turns.value = snap.turns.flatMap((row) => {
        const turn = asTurn(row);
        return turn ? [turn] : [];
      });
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
    onScopeDispose(() => {
      ticket += 1;
      disconnect();
    });
  });

  return { deliver, draft, error, live, loading, send, sending, turns };
}
