import type { ComputedRef, Ref } from "vue";
import type { CanvasPoint, CanvasViewport } from "@cela/design";
import type { ArtifactMeta } from "~~/shared/types/artifact";
import type { CanvasNote, CanvasPlacement, CardPlacement } from "~~/shared/types/canvas";
import type { ReceiptsSlice, TurnReceipt } from "~~/shared/types/receipts";
import type { ConversationVersions } from "~~/shared/types/versions";
import { emptyPlacement } from "~~/shared/types/canvas";

export type FrameStatus = "done" | "waiting" | "working";

export interface CardView {
  slug: string;
  title: string;
  file: string;
  kind: string;
  frame?: string;
  fresh: boolean;
  version?: number;
  comments?: number;
  meta: string;
  tell: string;
  placement: CardPlacement;
}

export interface FrameView {
  id: string;
  turn: number;
  title: string;
  tell: string;
  status: FrameStatus;
  count: number;
  open: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LinkView {
  id: string;
  d: string;
  x: number;
  y: number;
}

export interface Canvas {
  addNote: (at: CanvasPoint) => void;
  approve: (slug: string) => void;
  approved: ComputedRef<string[]>;
  cards: ComputedRef<CardView[]>;
  empty: ComputedRef<boolean>;
  frames: ComputedRef<FrameView[]>;
  links: ComputedRef<LinkView[]>;
  loaded: Ref<string | undefined>;
  moveCard: (slug: string, at: CanvasPoint) => void;
  notes: ComputedRef<CanvasNote[]>;
  removeNote: (id: string) => void;
  resizeCard: (slug: string, width?: number) => void;
  selection: Ref<string[]>;
  setNote: (id: string, patch: Partial<CanvasNote>) => void;
  toggleFrame: (id: string) => void;
  viewport: Ref<CanvasViewport>;
  viewports: Ref<Record<string, CanvasViewport>>;
}

export const CARD_W = 320;
export const CARD_H = 250;
export const NOTE_W = 220;
export const NOTE_H = 150;
// The mock's PAD and HEAD: a frame is its members' box plus this, never a stored rectangle.
const FRAME_PAD = 14;
const FRAME_HEAD = 42;
const GAP = 40;
const COLS = 3;
const FRAMELESS = "loose";
const SAVE_DEBOUNCE_MS = 600;

function slotOf(index: number): CanvasPoint {
  return {
    x: (index % COLS) * (CARD_W + GAP),
    y: Math.floor(index / COLS) * (CARD_H + GAP + FRAME_HEAD),
  };
}

/* Frame membership is derived from the earliest turn that wrote the file, so the
   grouping survives a reorder of the artifact list and needs nothing stored. */
function turnsByPath(versions?: ConversationVersions): Map<string, number> {
  const out = new Map<string, number>();
  for (const file of versions?.files ?? []) {
    const first = file.versions.reduce<number | undefined>(
      (low, v) => (!low || v.turn < low ? v.turn : low),
      undefined,
    );
    if (first) out.set(file.path, first);
  }
  return out;
}

function countsByPath(versions?: ConversationVersions): Map<string, number> {
  const out = new Map<string, number>();
  for (const file of versions?.files ?? []) {
    if (!file.skipped && file.versions.length) out.set(file.path, file.versions.length);
  }
  return out;
}

function promptOf(turns: TurnReceipt[], turn: number): string {
  const prompt = turns.find((row) => row.turn === turn)?.prompt;
  return prompt ? shorten(prompt, 64) : `Turn ${turn}`;
}

/* Bottom of one frame to the top of the next, bowed so two stacked frames never
   draw a link that hides along their shared edge. */
function linkPath(from: FrameView, to: FrameView): LinkView {
  const ax = from.x + from.width / 2;
  const ay = from.y + from.height;
  const bx = to.x + to.width / 2;
  const by = to.y;
  const bend = Math.max(24, Math.abs(by - ay) / 2);
  return {
    d: `M${ax} ${ay}C${ax} ${ay + bend} ${bx} ${by - bend} ${bx} ${by}`,
    id: `${from.id}->${to.id}`,
    x: (ax + bx) / 2,
    y: (ay + by) / 2,
  };
}

export function useCanvas(): Canvas {
  const sc = useSidecar();
  const { session } = useScreen();

  const viewports = useState<Record<string, CanvasViewport>>("sc:canvas-viewports", () => ({}));
  const loaded = useState<string | undefined>("sc:canvas-loaded");
  const selection = useState<string[]>("sc:canvas-selection", () => []);
  const placement = useState<CanvasPlacement>("sc:canvas-placement", () => emptyPlacement(""));
  const versions = useState<ConversationVersions | undefined>("sc:canvas-versions", () => undefined);
  const receipts = useState<TurnReceipt[]>("sc:canvas-receipts", () => []);
  // Not persisted on purpose: "new since you looked" is this reader's, not the conversation's.
  const seen = useState<Record<string, number>>("sc:canvas-seen", () => ({}));

  // Cards the reader has moved. Until a save lands, a slow GET must not walk them back.
  const dirty = new Set<string>();
  let ticket = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const key = computed(() => sc.sessionKey.value);

  const viewport = computed({
    get(): CanvasViewport {
      const here = key.value;
      return (here && viewports.value[here]) || { x: 0, y: 0, zoom: 1 };
    },
    // A mount-time clamp must not stamp the default as a stored pan.
    set(next: CanvasViewport): void {
      const here = key.value;
      if (!here || !viewports.value[here]) return;
      viewports.value = { ...viewports.value, [here]: next };
    },
  });

  const metas = computed(() => new Map(sc.catalogue.value.map((meta) => [meta.slug, meta])));

  const artifacts = computed<ArtifactMeta[]>(() =>
    (session.value?.artifacts ?? []).flatMap((slug) => {
      const meta = metas.value.get(slug);
      return meta ? [meta] : [];
    }),
  );

  const firstTurn = computed(() => turnsByPath(versions.value));
  const versionCount = computed(() => countsByPath(versions.value));

  function frameOf(meta: ArtifactMeta): string {
    const override = placement.value.cards[meta.slug]?.frame;
    if (override) return override;
    const turn = firstTurn.value.get(meta.path);
    return turn ? `turn:${turn}` : FRAMELESS;
  }

  /* Ordered by frame so the fallback layout puts a task's artifacts together, and
     keyed off the slug's rank rather than the list index, which reorders on poll. */
  const ordered = computed<ArtifactMeta[]>(() =>
    [...artifacts.value].sort((a, b) => {
      const fa = frameOf(a);
      const fb = frameOf(b);
      return fa === fb ? a.slug.localeCompare(b.slug) : fa.localeCompare(fb);
    }),
  );

  function placementOf(slug: string): CardPlacement {
    const held = placement.value.cards[slug];
    if (held) return held;
    const at = slotOf(ordered.value.findIndex((meta) => meta.slug === slug));
    return { x: at.x, y: at.y };
  }

  /* Verbatim what Claude is told when this card is commented on, so it has to read
     as a sentence a person would say rather than as a widget reference. */
  function tellOf(meta: ArtifactMeta, version?: number): string {
    const turn = firstTurn.value.get(meta.path);
    const facts = [version ? `v${version}` : undefined, turn ? `written t${turn}` : undefined].filter(Boolean);
    const under = turn ? ` under task ${turn} “${promptOf(receipts.value, turn)}”` : "";
    return `On ${basename(meta.path)}${facts.length ? ` (${facts.join(", ")})` : ""}${under}`;
  }

  const cards = computed<CardView[]>(() =>
    ordered.value.map((meta) => {
      const held = placementOf(meta.slug);
      const stamp = Date.parse(meta.updated ?? "");
      const since = key.value ? seen.value[key.value] : undefined;
      const detail = sc.artifact.value?.slug === meta.slug ? sc.artifact.value : undefined;
      const version = versionCount.value.get(meta.path);
      return {
        // The loaded artifact knows its open count exactly; every other card takes the list's total.
        comments: detail ? detail.threads.filter((t) => t.status === "open").length : meta.threadCount,
        file: basename(meta.path),
        fresh: !!since && stamp > since,
        frame: frameOf(meta),
        kind: meta.ds || "artifact",
        meta: [meta.target === "b" ? "published" : "local", relativeAge(meta.updated)].filter(Boolean).join(" · "),
        placement: held,
        slug: meta.slug,
        tell: tellOf(meta, version),
        title: meta.title || deslug(meta.slug),
        version,
      };
    }),
  );

  const status = computed<FrameStatus>(() => {
    if (!session.value?.live) return "done";
    return session.value.status === "busy" ? "working" : "waiting";
  });

  const frames = computed<FrameView[]>(() => {
    const groups = new Map<string, CardView[]>();
    for (const card of cards.value) {
      if (!card.frame || card.frame === FRAMELESS) continue;
      const bucket = groups.get(card.frame);
      if (bucket) bucket.push(card);
      else groups.set(card.frame, [card]);
    }
    const latest = Math.max(0, ...[...groups.keys()].map((id) => Number(id.split(":")[1]) || 0));
    return [...groups]
      .map(([id, members]): FrameView => {
        const turn = Number(id.split(":")[1]) || 0;
        const open = !placement.value.collapsed.includes(id);
        const title = promptOf(receipts.value, turn);
        const left = Math.min(...members.map((c) => c.placement.x));
        const top = Math.min(...members.map((c) => c.placement.y));
        const right = Math.max(...members.map((c) => c.placement.x + (c.placement.width ?? CARD_W)));
        const bottom = Math.max(...members.map((c) => c.placement.y + CARD_H));
        return {
          count: members.length,
          height: open ? bottom - top + FRAME_HEAD + FRAME_PAD * 2 : FRAME_HEAD,
          id,
          open,
          status: turn === latest ? status.value : "done",
          tell: `On task ${turn} “${title}”, and everything made during it`,
          title,
          turn,
          width: open ? right - left + FRAME_PAD * 2 : Math.max(CARD_W, right - left + FRAME_PAD * 2),
          x: left - FRAME_PAD,
          y: top - FRAME_HEAD - FRAME_PAD,
        };
      })
      .sort((a, b) => a.turn - b.turn);
  });

  // Consecutive tasks, so the plane reads as the conversation's order rather than a web.
  const links = computed<LinkView[]>(() =>
    frames.value.slice(1).flatMap((frame, i) => {
      const previous = frames.value[i];
      return previous ? [linkPath(previous, frame)] : [];
    }),
  );

  const notes = computed(() => placement.value.notes);

  const approved = computed(() => placement.value.approved);

  const empty = computed(() => !cards.value.length && !notes.value.length);

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
  }

  async function save(): Promise<void> {
    const here = key.value;
    if (!here) return;
    const body: CanvasPlacement = { ...placement.value, at: Date.now(), key: here };
    try {
      await $fetch<CanvasPlacement>(`/api/sessions/${encodeURIComponent(here)}/canvas`, { body, method: "PUT" });
      dirty.clear();
    } catch {
      // D2 may not serve this yet, and a lost write must never snap a card back.
    }
  }

  function write(slug: string, patch: Partial<CardPlacement>): void {
    const held = placementOf(slug);
    placement.value.cards[slug] = { ...held, ...patch };
    dirty.add(slug);
    schedule();
  }

  function moveCard(slug: string, at: CanvasPoint): void {
    write(slug, { x: at.x, y: at.y });
  }

  // The item's width model is optional; an absent width is "no explicit width", not a resize.
  function resizeCard(slug: string, width?: number): void {
    if (width) write(slug, { width });
  }

  function toggleFrame(id: string): void {
    const collapsed = placement.value.collapsed;
    placement.value.collapsed = collapsed.includes(id) ? collapsed.filter((f) => f !== id) : [...collapsed, id];
    schedule();
  }

  function approve(slug: string): void {
    const approved = placement.value.approved;
    placement.value.approved = approved.includes(slug) ? approved : [...approved, slug];
    schedule();
  }

  function addNote(at: CanvasPoint): void {
    placement.value.notes = [
      ...placement.value.notes,
      { at: Date.now(), id: crypto.randomUUID(), text: "", x: at.x, y: at.y },
    ];
    schedule();
  }

  function setNote(id: string, patch: Partial<CanvasNote>): void {
    placement.value.notes = placement.value.notes.map((note) => (note.id === id ? { ...note, ...patch } : note));
    schedule();
  }

  function removeNote(id: string): void {
    placement.value.notes = placement.value.notes.filter((note) => note.id !== id);
    schedule();
  }

  async function load(here?: string): Promise<void> {
    const mine = ++ticket;
    selection.value = [];
    dirty.clear();
    placement.value = emptyPlacement(here ?? "");
    versions.value = undefined;
    receipts.value = [];
    if (!here) return;
    const [stored, listed, slice] = await Promise.all([
      $fetch<CanvasPlacement>(`/api/sessions/${encodeURIComponent(here)}/canvas`).catch(() => undefined),
      $fetch<ConversationVersions>(`/api/sessions/${encodeURIComponent(here)}/versions`).catch(() => undefined),
      $fetch<ReceiptsSlice>(`/api/sessions/${encodeURIComponent(here)}/receipts`).catch(() => undefined),
    ]);
    // A tab switch during the fetch makes this answer someone else's; drop it.
    if (mine !== ticket) return;
    if (stored) {
      // A card dragged while the GET was in flight keeps the reader's position, not the server's.
      const moved = Object.entries(placement.value.cards).filter(([slug]) => dirty.has(slug));
      placement.value = {
        ...emptyPlacement(here),
        ...stored,
        cards: { ...stored.cards, ...Object.fromEntries(moved) },
      };
    }
    versions.value = listed;
    receipts.value = slice?.turns ?? [];
    seen.value = { ...seen.value, [here]: seen.value[here] ?? Date.now() };
    loaded.value = here;
  }

  onMounted(() => {
    watch(key, (here) => void load(here), { immediate: true });
    onScopeDispose(() => {
      ticket += 1;
      if (timer) clearTimeout(timer);
    });
  });

  return {
    addNote,
    approve,
    approved,
    cards,
    empty,
    frames,
    links,
    loaded,
    moveCard,
    notes,
    removeNote,
    resizeCard,
    selection,
    setNote,
    toggleFrame,
    viewport,
    viewports,
  };
}
