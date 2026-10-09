import type { ComputedRef, Ref } from "vue";
import type { Maybe, MaybeComputed } from "~/composables/useSidecar";
import type { ReceiptsSlice, TurnReceipt } from "~~/shared/types/receipts";
import type { BaselineOrigin, ConversationVersions, RestoreResult, VersionPair } from "~~/shared/types/versions";

// `turns`: what the picked turns did together. `head`: from before them to the newest version.
export type Compare = "turns" | "head";

export interface TurnRange {
  first: number;
  last: number;
}

export interface HistoryTurn {
  receipt: TurnReceipt;
  reply?: string;
  /** Agent work that landed after the session went quiet, belonging to no closed turn. */
  inFlight: boolean;
  /** First turn the reader has not seen, which is where the divider goes. */
  fresh: boolean;
  spawned: string[];
}

export interface HistoryFile {
  path: string;
  name: string;
  by?: string;
  baseline: BaselineOrigin;
  state: DiffState;
}

export interface History {
  capped: ComputedRef<boolean>;
  compare: Ref<Compare>;
  diffing: Ref<boolean>;
  error: Maybe<string>;
  files: Ref<HistoryFile[]>;
  /** The last restore refused, and overwriting is the one thing that would get past it. */
  forceable: ComputedRef<boolean>;
  loading: Ref<boolean>;
  /** A plain pick starts a range on that turn; `extend` stretches it to this one, the way shift-click does. */
  pick: (turn: number, extend?: boolean) => void;
  range: MaybeComputed<TurnRange>;
  restore: (path: string, force?: boolean) => Promise<void>;
  restored: Maybe<RestoreResult>;
  selected: Maybe<number>;
  turns: ComputedRef<HistoryTurn[]>;
}

interface Snapshot {
  offset: number;
  turns: { at: number; role: string; text: string }[];
}

const SEEN_KEY = "sc:history-seen";
const SPAWN = /^spawned\s+(.+)$/;

function seenOf(key: string): number {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, unknown>;
    const turn = raw[key];
    return typeof turn === "number" ? turn : 0;
  } catch {
    return 0;
  }
}

function markSeen(key: string, turn: number): void {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, unknown>;
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...raw, [key]: turn }));
  } catch {
    // a browser refusing storage costs the divider, nothing else
  }
}

/** The assistant text that landed between this turn and the next, which is that turn's reply. */
function replyBetween(snapshot: Snapshot["turns"], from: number, to: number): string | undefined {
  const said = snapshot.filter((row) => row.role === "assistant" && row.at >= from && row.at < to);
  const text = said.map((row) => row.text.trim()).filter(Boolean).join("\n\n");
  return text || undefined;
}

export function useHistory(): History {
  const sc = useSidecar();

  const compare = ref<Compare>("turns");
  const error = ref<string>();
  const files = ref<HistoryFile[]>([]);
  const loading = ref(false);
  const diffing = ref(false);
  const receipts = ref<TurnReceipt[]>([]);
  const replies = ref<Map<number, string>>(new Map());
  const restored = ref<RestoreResult>();
  const selected = ref<number>();
  const through = ref<number>();
  const versions = ref<ConversationVersions>();

  const range = computed<TurnRange | undefined>(() => {
    const anchor = selected.value;
    if (!anchor) return undefined;
    const end = through.value ?? anchor;
    return { first: Math.min(anchor, end), last: Math.max(anchor, end) };
  });

  function pick(turn: number, extend = false): void {
    if (extend && selected.value) {
      through.value = turn;
      return;
    }
    selected.value = turn;
    through.value = undefined;
  }
  const seen = ref(0);

  let loadTicket = 0;
  let diffTicket = 0;

  const capped = computed(() => !!versions.value?.capped);

  const forceable = computed(() => {
    const done = restored.value;
    return !!done && !done.restored && done.forceable;
  });

  const turns = computed<HistoryTurn[]>(() =>
    receipts.value.map((receipt, index) => ({
      receipt,
      reply: replies.value.get(receipt.turn),
      inFlight: index === receipts.value.length - 1 && !receipt.prompt,
      fresh: receipt.turn > seen.value,
      spawned: receipt.ran.flatMap((one) => SPAWN.exec(one.command)?.[1] ?? []),
    })),
  );

  async function load(key?: string): Promise<void> {
    const mine = ++loadTicket;
    receipts.value = [];
    files.value = [];
    versions.value = undefined;
    replies.value = new Map();
    restored.value = undefined;
    selected.value = undefined;
    through.value = undefined;
    error.value = undefined;
    if (!key) return;

    seen.value = seenOf(key);
    loading.value = true;
    const at = encodeURIComponent(key);
    try {
      const [slice, store, snapshot] = await Promise.all([
        $fetch<ReceiptsSlice>(`/api/sessions/${at}/receipts`),
        $fetch<ConversationVersions>(`/api/sessions/${at}/versions`),
        $fetch<Snapshot>(`/api/sessions/${at}/conversation`).catch(() => ({ offset: 0, turns: [] }) as Snapshot),
      ]);
      if (mine !== loadTicket) return;

      receipts.value = slice.turns;
      versions.value = store;
      const paired = new Map<number, string>();
      for (const [index, receipt] of slice.turns.entries()) {
        const until = slice.turns[index + 1]?.at ?? Number.MAX_SAFE_INTEGER;
        const reply = replyBetween(snapshot.turns, receipt.at, until);
        if (reply) paired.set(receipt.turn, reply);
      }
      replies.value = paired;
      selected.value = slice.turns.at(-1)?.turn;

      const newest = slice.turns.at(-1)?.turn;
      if (newest) markSeen(key, newest);
    } catch (caught) {
      if (mine !== loadTicket) return;
      error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      if (mine === loadTicket) loading.value = false;
    }
  }

  async function pullDiffs(): Promise<void> {
    const mine = ++diffTicket;
    const key = sc.sessionKey.value;
    const span = range.value;
    const store = versions.value;
    if (!key || !span || !store) {
      files.value = [];
      return;
    }

    const inSpan = receipts.value.filter((one) => one.turn >= span.first && one.turn <= span.last);
    const touched = [...new Set(inSpan.flatMap((one) => [...one.wrote, ...one.deleted]))];
    if (!touched.length) {
      files.value = [];
      return;
    }

    diffing.value = true;
    const at = encodeURIComponent(key);
    // Read from before the first picked turn, so its own edit is part of what is shown.
    const from = span.first - 1;
    const to = compare.value === "head" ? "head" : span.last;
    const built = await Promise.all(
      touched.map(async (path): Promise<HistoryFile> => {
        // A file the store holds no record of is genuinely unknown, not silently unchanged.
        const file = store.files.find((one) => one.path === path) ?? { path, baseline: "unknown" as const, versions: [] };
        const query = `path=${encodeURIComponent(path)}&from=${from}&to=${to}`;
        const pair = await $fetch<VersionPair>(`/api/sessions/${at}/versions/pair?${query}`).catch(() => undefined);
        const by = [...new Set(file.versions.filter((one) => one.turn >= span.first && one.turn <= span.last).map((one) => one.by))];
        return {
          path,
          name: basename(path),
          by: by.join(", ") || undefined,
          baseline: file.baseline,
          state: Diff.readPair({ file, to, pair }),
        };
      }),
    );
    if (mine !== diffTicket) return;
    files.value = built;
    diffing.value = false;
  }

  async function restore(path: string, force?: boolean): Promise<void> {
    const key = sc.sessionKey.value;
    const turn = range.value?.last;
    if (!key || !turn) return;
    restored.value = await $fetch<RestoreResult>(`/api/sessions/${encodeURIComponent(key)}/versions/restore`, {
      method: "POST",
      body: { path, turn, force },
    }).catch((caught: unknown) => ({
      path,
      turn,
      // A call that never reached the store proves nothing about disk, so force would not help.
      forceable: false,
      restored: false,
      reason: caught instanceof Error ? caught.message : "the restore call failed",
    }));
  }

  onMounted(() => {
    watch(() => sc.sessionKey.value, (key) => void load(key), { immediate: true });
    watch([range, compare, versions], () => void pullDiffs(), { immediate: true });
    // A restore receipt names the turn it acted on, so it must not follow the reader to another turn.
    watch(range, () => {
      restored.value = undefined;
    });
    onScopeDispose(() => {
      loadTicket += 1;
      diffTicket += 1;
    });
  });

  return { capped, compare, diffing, error, files, forceable, loading, pick, range, restore, restored, selected, turns };
}
