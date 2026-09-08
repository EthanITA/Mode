import type { ComputedRef, Ref } from "vue";
import type { Maybe } from "~/composables/useSidecar";
import type { ReceiptsSlice, TurnReceipt } from "~~/shared/types/receipts";
import type { BaselineOrigin, ConversationVersions, FileDiff, RestoreResult } from "~~/shared/types/versions";

export type Compare = "head" | "next";

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

  const compare = ref<Compare>("head");
  const error = ref<string>();
  const files = ref<HistoryFile[]>([]);
  const loading = ref(false);
  const diffing = ref(false);
  const receipts = ref<TurnReceipt[]>([]);
  const replies = ref<Map<number, string>>(new Map());
  const restored = ref<RestoreResult>();
  const selected = ref<number>();
  const versions = ref<ConversationVersions>();
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
    const turn = selected.value;
    const store = versions.value;
    if (!key || !turn || !store) {
      files.value = [];
      return;
    }

    const receipt = receipts.value.find((one) => one.turn === turn);
    const touched = [...new Set([...(receipt?.wrote ?? []), ...(receipt?.deleted ?? [])])];
    if (!touched.length) {
      files.value = [];
      return;
    }

    diffing.value = true;
    const at = encodeURIComponent(key);
    const to = compare.value;
    const built = await Promise.all(
      touched.map(async (path): Promise<HistoryFile> => {
        // A file the store holds no record of is genuinely unknown, not silently unchanged.
        const file = store.files.find((one) => one.path === path) ?? { path, baseline: "unknown" as const, versions: [] };
        const query = `path=${encodeURIComponent(path)}&from=${turn}&to=${to}`;
        const diff = await $fetch<FileDiff>(`/api/sessions/${at}/versions/diff?${query}`).catch(() => undefined);
        return {
          path,
          name: basename(path),
          by: file.versions.find((one) => one.turn === turn)?.by || undefined,
          baseline: file.baseline,
          state: Diff.read({ file, to, diff }),
        };
      }),
    );
    if (mine !== diffTicket) return;
    files.value = built;
    diffing.value = false;
  }

  async function restore(path: string, force?: boolean): Promise<void> {
    const key = sc.sessionKey.value;
    const turn = selected.value;
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
    watch([selected, compare, versions], () => void pullDiffs(), { immediate: true });
    // A restore receipt names the turn it acted on, so it must not follow the reader to another turn.
    watch(selected, () => {
      restored.value = undefined;
    });
    onScopeDispose(() => {
      loadTicket += 1;
      diffTicket += 1;
    });
  });

  return { capped, compare, diffing, error, files, forceable, loading, restore, restored, selected, turns };
}
