import type { ComputedRef, Ref } from "vue";
import type { Maybe, MaybeComputed } from "~/composables/useSidecar";
import type { DiffState } from "~/utils/diff";
import type { RestorePlan, Turn, TurnFile } from "~/utils/turns";
import type { ReceiptsSlice, TurnReceipt } from "~~/shared/types/receipts";
import type { ConversationVersions, RestoreResult, VersionPair } from "~~/shared/types/versions";

export type FileBody = DiffState | { kind: "reading" } | { kind: "pending" };

export type RestoreNotice =
  | { kind: "restored"; was?: number }
  | { kind: "undone" }
  | { kind: "conflict"; turn: number }
  | { kind: "failed"; reason: string };

export interface History {
  bodyOf: (file: TurnFile) => FileBody;
  capped: ComputedRef<boolean>;
  /** Set only when the first load failed; a later failed refresh keeps the last good turns. */
  error: Maybe<string>;
  loading: Ref<boolean>;
  notices: Ref<Partial<Record<string, RestoreNotice>>>;
  pick: (turn: number) => void;
  picked: MaybeComputed<Turn>;
  planOf: (file: TurnFile) => RestorePlan;
  restore: (file: TurnFile, force?: boolean) => Promise<void>;
  restoring: Maybe<string>;
  retry: () => void;
  /** The newest turn the reader had seen when History opened, which is where the divider stays. */
  seen: Ref<number>;
  turns: ComputedRef<Turn[]>;
  undo: (file: TurnFile) => Promise<void>;
}

interface Snapshot {
  offset: number;
  turns: { at: number; role: string; text: string }[];
}

const SEEN_KEY = "sc:history-seen";
const REFRESH_MS = 5000;
// Each pair is a node process under the store's lock, so a 40-file turn must not wait on all of them at once.
const PAIR_LANES = 4;

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
  const text = said
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join("\n\n");
  return text || undefined;
}

function repliesOf(receipts: TurnReceipt[], snapshot: Snapshot): Map<number, string> {
  const replies = new Map<number, string>();
  for (const [index, receipt] of receipts.entries()) {
    const reply = replyBetween(snapshot.turns, receipt.at, receipts[index + 1]?.at ?? Number.MAX_SAFE_INTEGER);
    if (reply) replies.set(receipt.turn, reply);
  }
  return replies;
}

export function useHistory(): History {
  const sc = useSidecar();
  const choice = useConversationPick("hi:picks");

  const error = ref<string>();
  const loading = ref(false);
  const notices = ref<Partial<Record<string, RestoreNotice>>>({});
  const receipts = ref<TurnReceipt[]>([]);
  const replies = ref(new Map<number, string>());
  const restoring = ref<string>();
  const seen = ref(0);
  const versions = ref<ConversationVersions>();
  // Keyed by both sides' commits, so a running turn's next edit fetches anew and nothing else does.
  const pairs = shallowReactive(new Map<string, DiffState>());
  // A file's last diff stays on screen while its next one loads, so a running turn never blinks to "Reading".
  const shown = shallowReactive(new Map<string, DiffState>());
  const slots = new Map<string, string>();
  const inFlight = new Set<string>();
  let mark = "";
  let touched = 0;
  let ticket = 0;
  let isRefreshing = false;

  const status = computed(() => sc.sessions.value.find((one) => one.key === sc.sessionKey.value)?.status);
  const turns = computed(() =>
    Turns.build({ receipts: receipts.value, versions: versions.value, replies: replies.value, status: status.value }),
  );
  const picked = computed(() => turns.value.find((one) => String(one.turn) === choice.value) ?? turns.value[0]);
  const capped = computed(() => !!versions.value?.capped);

  // Picking the newest leaves no pick behind, so a new turn landing takes its place the way a tail does.
  function pick(turn: number): void {
    choice.value = turn === turns.value[0]?.turn ? undefined : String(turn);
  }

  function entryOf(path: string): ConversationVersions["files"][number] | undefined {
    return versions.value?.files.find((one) => one.path === path);
  }

  function pairId({ turn, file }: { turn: Turn; file: TurnFile }): string | undefined {
    const entry = entryOf(file.path);
    const own = entry?.versions.find((one) => one.turn === turn.turn);
    if (!entry || !own) return undefined;
    const earlier = entry.versions.filter((one) => one.turn < turn.turn).at(-1);
    return [sc.sessionKey.value, file.path, earlier?.sha ?? "base", own.sha].join("\0");
  }

  function slotOf({ turn, file }: { turn: Turn; file: TurnFile }): string {
    return [sc.sessionKey.value, turn.turn, file.path].join("\0");
  }

  function bodyOf(file: TurnFile): FileBody {
    const turn = picked.value;
    if (!turn) return { kind: "reading" };
    const id = pairId({ turn, file });
    if (id) return pairs.get(id) ?? shown.get(slotOf({ turn, file })) ?? { kind: "reading" };
    if (file.kind === "unchanged")
      return { kind: "absent", reason: "no change between the start and end of this turn" };
    const entry = entryOf(file.path);
    if (entry?.skipped) return { kind: "absent", reason: `not versioned, ${entry.skipped}` };
    if (turn.state !== "done" || turn.isOpen) return { kind: "pending" };
    return { kind: "absent", reason: "the version store holds no version of this file from this turn" };
  }

  async function pullPairs(): Promise<void> {
    const key = sc.sessionKey.value;
    const turn = picked.value;
    if (!key || !turn) return;
    const queue = turn.files.flatMap((file) => {
      const id = pairId({ turn, file });
      return id && !pairs.has(id) && !inFlight.has(id) ? [{ id, file }] : [];
    });
    for (const one of queue) inFlight.add(one.id);
    const at = encodeURIComponent(key);
    const lane = async (): Promise<void> => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const entry = entryOf(next.file.path);
        const query = `path=${encodeURIComponent(next.file.path)}&from=${turn.turn - 1}&to=${turn.turn}`;
        const pair = await $fetch<VersionPair>(`/api/sessions/${at}/versions/pair?${query}`).catch(() => undefined);
        inFlight.delete(next.id);
        if (!entry) continue;
        const state = Diff.readPair({ file: entry, to: turn.turn, pair });
        const slot = slotOf({ turn, file: next.file });
        // Both full texts sit in each pair, so a file re-edited all turn would otherwise pile up every version.
        const replaced = slots.get(slot);
        if (replaced && replaced !== next.id) pairs.delete(replaced);
        slots.set(slot, next.id);
        pairs.set(next.id, state);
        shown.set(slot, state);
      }
    };
    await Promise.all(Array.from({ length: PAIR_LANES }, lane));
  }

  async function refresh(key: string): Promise<void> {
    if (isRefreshing) return;
    isRefreshing = true;
    const mine = ticket;
    const at = encodeURIComponent(key);
    try {
      const slice = await $fetch<ReceiptsSlice>(`/api/sessions/${at}/receipts`);
      const newest = slice.turns.at(-1);
      const writes = slice.turns.reduce((sum, one) => sum + one.wrote.length + one.deleted.length, 0);
      const work = slice.turns.reduce((sum, one) => sum + one.ran.length + (one.by?.length ?? 0), 0);
      // The offset is the main transcript's size alone, and a subagent's progress only shows in the other counts.
      const next = [slice.offset, slice.turns.length, writes, work].join(":");
      if (mine !== ticket || next === mark) return;
      // A running turn editing the same file again changes no count, so the newest turn's writes re-pull too.
      const isStale = !versions.value || writes !== touched || !!newest?.wrote.length || !!newest?.deleted.length;
      const [store, snapshot] = await Promise.all([
        isStale ? $fetch<ConversationVersions>(`/api/sessions/${at}/versions`) : versions.value,
        $fetch<Snapshot>(`/api/sessions/${at}/conversation`).catch(() => ({ offset: 0, turns: [] }) as Snapshot),
      ]);
      if (mine !== ticket) return;
      mark = next;
      touched = writes;
      receipts.value = slice.turns;
      versions.value = store;
      replies.value = repliesOf(slice.turns, snapshot);
      error.value = undefined;
      if (newest) markSeen(key, newest.turn);
    } catch (caught) {
      // Only a History that never loaded says so; a refresh that fails keeps what the reader has.
      if (mine === ticket && !mark) error.value = caught instanceof Error ? caught.message : String(caught);
    } finally {
      isRefreshing = false;
      if (mine === ticket) loading.value = false;
    }
  }

  function load(key?: string): void {
    ticket += 1;
    mark = "";
    touched = 0;
    isRefreshing = false;
    receipts.value = [];
    versions.value = undefined;
    replies.value = new Map();
    notices.value = {};
    error.value = undefined;
    pairs.clear();
    shown.clear();
    slots.clear();
    inFlight.clear();
    if (!key) return;
    seen.value = seenOf(key);
    loading.value = true;
    void refresh(key);
  }

  async function send({
    file,
    turn,
    force,
  }: {
    file: TurnFile;
    turn: number;
    force?: boolean;
  }): Promise<RestoreResult> {
    const key = sc.sessionKey.value ?? "";
    restoring.value = file.path;
    try {
      return await $fetch<RestoreResult>(`/api/sessions/${encodeURIComponent(key)}/versions/restore`, {
        method: "POST",
        body: { path: file.path, turn, force },
      });
    } catch (caught) {
      // A call that never reached the store proves nothing about disk, so force would not help.
      return {
        path: file.path,
        turn,
        restored: false,
        forceable: false,
        reason: caught instanceof Error ? caught.message : "the restore call failed",
      };
    } finally {
      restoring.value = undefined;
    }
  }

  function noticeOf({ done, isUndo }: { done: RestoreResult; isUndo: boolean }): RestoreNotice {
    if (done.restored) return isUndo ? { kind: "undone" } : { kind: "restored", was: done.was };
    if (done.forceable) return { kind: "conflict", turn: done.turn };
    return { kind: "failed", reason: done.reason || "no reason was given" };
  }

  async function restore(file: TurnFile, force?: boolean): Promise<void> {
    const turn = picked.value;
    if (!turn) return;
    const prior = notices.value[file.path];
    const target = force && prior?.kind === "conflict" ? prior.turn : turn.turn - 1;
    const done = await send({ file, turn: target, force });
    const notice = noticeOf({ done, isUndo: false });
    // A second Restore finds disk already on the before-state, so only the first knows where Undo goes.
    const kept = notice.kind === "restored" && prior?.kind === "restored" ? prior : notice;
    notices.value = { ...notices.value, [file.path]: kept };
  }

  async function undo(file: TurnFile): Promise<void> {
    const prior = notices.value[file.path];
    if (prior?.kind !== "restored" || typeof prior.was !== "number") return;
    const done = await send({ file, turn: prior.was });
    notices.value = { ...notices.value, [file.path]: noticeOf({ done, isUndo: true }) };
  }

  function planOf(file: TurnFile): RestorePlan {
    const turn = picked.value;
    return turn ? Turns.restoreOf({ turn, file, versions: versions.value }) : { isEnabled: false, tip: "" };
  }

  onMounted(() => {
    watch(
      () => sc.sessionKey.value,
      (key) => load(key),
      { immediate: true },
    );
    watch([picked, versions], () => void pullPairs(), { immediate: true });
    // A notice names the turn it acted on, so it must not follow the reader to another turn.
    watch(
      () => picked.value?.turn,
      () => (notices.value = {}),
    );
    const timer = window.setInterval(() => sc.sessionKey.value && void refresh(sc.sessionKey.value), REFRESH_MS);
    onScopeDispose(() => {
      window.clearInterval(timer);
      ticket += 1;
    });
  });

  return {
    bodyOf,
    capped,
    error,
    loading,
    notices,
    pick,
    picked,
    planOf,
    restore,
    restoring,
    retry: () => load(sc.sessionKey.value),
    seen,
    turns,
    undo,
  };
}
