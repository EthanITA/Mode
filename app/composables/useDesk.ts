import type { BoardSummary } from "~~/shared/types/board";
import type { Slot, Why } from "~~/shared/types/mode";
import type { LiveSession, SessionLane } from "~~/shared/types/session";
import { CARD_H, CARD_W, NOTE_H, NOTE_W } from "~/composables/useCanvas";
import { homePath, plural, relativeAge } from "~/utils/label";
import { tintOf, type Tint } from "~/utils/tint";

export interface DeskArtifact {
  slug: string;
  title: string;
  isNew: boolean;
}

export interface DeskBox {
  x: number;
  y: number;
  w: number;
  h: number;
  note?: boolean;
}

export interface DeskCard {
  key: string;
  title: string;
  ago: string;
  cwd: string;
  gitBranch?: string;
  tint: Tint;
  live: boolean;
  running: boolean;
  waiting: boolean;
  waitText: string;
  hasNew: boolean;
  newText: string;
  quiet: boolean;
  arts: DeskArtifact[];
  mode: string;
  modeTint: Tint;
  style: string;
  board?: number;
  lane?: SessionLane;
  archived: boolean;
  boxes: DeskBox[];
  at: { x: number; y: number };
}

const SEEN_KEY = "sc:desk-seen";
const LAYOUT_KEY = "sc:desk-layout";
const ARCHIVE_KEY = "sc:desk-archive";
const COLS = 3;
const GAP = 40;

function readSeen(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Called when a card is opened, so its artifacts stop reading as new next visit. */
export function markDeskSeen(key: string, artifacts: string[]): void {
  const seen = readSeen();
  seen[key] = artifacts;
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}

function readLayout(): Record<string, { x: number; y: number }> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function useDeskLayout(): {
  at: (key: string, index: number) => { x: number; y: number };
  held: Ref<Record<string, { x: number; y: number }>>;
  move: (key: string, to: { x: number; y: number }) => void;
  archive: WritableComputedRef<boolean>;
} {
  // The app is SPA-only, so localStorage is there at setup and the state seeds from it directly.
  const held = useState<Record<string, { x: number; y: number }>>("sc:desk-layout", readLayout);
  const on = useState<boolean>("sc:desk-archive", () => localStorage.getItem(ARCHIVE_KEY) === "on");

  const archive = computed({
    get: () => on.value,
    set(next: boolean): void {
      on.value = next;
      localStorage.setItem(ARCHIVE_KEY, next ? "on" : "off");
    },
  });

  function at(key: string, index: number): { x: number; y: number } {
    const stored = held.value[key];
    if (stored) return stored;
    return { x: (index % COLS) * (CARD_W + GAP), y: Math.floor(index / COLS) * (CARD_H + GAP) };
  }

  function move(key: string, to: { x: number; y: number }): void {
    held.value = { ...held.value, [key]: to };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(held.value));
  }

  return { at, held, move, archive };
}

function shutGates(why: Why | undefined): number {
  return why?.gates.filter((gate) => gate.state === "shut").length ?? 0;
}

// No stored canvas means no preview, rather than faking one from the artifact count.
function boxesOf(session: LiveSession): DeskBox[] {
  const stored = session.preview;
  if (!stored) return [];
  return [
    ...stored.cards.map((card) => ({ x: card.x, y: card.y, w: card.width ?? CARD_W, h: CARD_H })),
    ...stored.notes.map((note) => ({ x: note.x, y: note.y, w: note.width ?? NOTE_W, h: NOTE_H, note: true })),
  ];
}

function slotLabel(slot: Slot): string {
  return slot.name || "auto";
}

const boardCounts = () => useState<Record<string, number>>("sc:desk-board", () => ({}));

/** Called once by the grid, mirroring loadSidecar's split between state and its own fetch. */
export function loadDeskBoards(): void {
  const sc = useSidecar();
  const boards = boardCounts();

  async function pull(): Promise<void> {
    const pairs = await Promise.all(
      sc.sessions.value.map(async (session): Promise<[string, number] | undefined> => {
        try {
          const summary = await $fetch<BoardSummary>(`/api/sessions/${session.key}/board`);
          return [session.key, summary.count];
        } catch {
          return undefined;
        }
      }),
    );
    boards.value = Object.fromEntries(pairs.filter((pair): pair is [string, number] => Boolean(pair)));
  }

  onMounted(() => {
    void pull();
    watch(() => sc.sessions.value, () => void pull());
  });
}

export function useDeskCards(): {
  cards: ComputedRef<DeskCard[]>;
  meta: ComputedRef<string>;
  head: ComputedRef<string>;
  hidden: ComputedRef<number>;
  archive: WritableComputedRef<boolean>;
} {
  const sc = useSidecar();
  const boards = boardCounts();
  const { at, archive } = useDeskLayout();
  const titles = computed(() => new Map(sc.catalogue.value.map((meta) => [meta.slug, meta.title])));

  const shown = computed(() => sc.sessions.value.filter((session) => archive.value || !session.archived));

  const cards = computed<DeskCard[]>(() => {
    const seen = readSeen();
    return shown.value.map((session: LiveSession, index: number) => {
      const why = sc.whys.value[session.key];
      const seenSlugs = new Set(seen[session.key]);
      const hasBaseline = session.key in seen;
      const newSlugs = hasBaseline ? session.artifacts.filter((slug) => !seenSlugs.has(slug)) : [];
      const gates = shutGates(why);
      const running = session.live && session.status === "busy";
      const waiting = gates > 0;
      const hasNew = newSlugs.length > 0;

      return {
        key: session.key,
        title: session.name || homePath(session.cwd).split("/").pop() || session.key,
        ago: relativeAge(session.lastActive ? new Date(session.lastActive).toISOString() : undefined),
        cwd: homePath(session.cwd),
        gitBranch: session.gitBranch,
        tint: tintOf(session.color, session.key),
        live: session.live,
        running,
        waiting,
        waitText: plural(gates, "gate"),
        hasNew,
        newText: plural(newSlugs.length, "new"),
        quiet: session.live && !running && !waiting && !hasNew,
        arts: session.artifacts.map((slug) => ({
          slug,
          title: titles.value.get(slug) || slug,
          isNew: !hasBaseline || newSlugs.includes(slug),
        })),
        mode: slotLabel(session.slots.mode),
        modeTint: tintOf(session.slots.mode.color, `mode:${session.slots.mode.name ?? ""}`),
        style: slotLabel(session.slots.style),
        board: boards.value[session.key],
        lane: session.lane,
        archived: !!session.archived,
        boxes: boxesOf(session),
        at: at(session.key, index),
      };
    });
  });

  const meta = computed(() => plural(cards.value.length, "conversation"));
  const head = computed(() => {
    const live = cards.value.filter((card) => card.live).length;
    const waiting = cards.value.filter((card) => card.waiting).length;
    return waiting ? `${live} live · ${plural(waiting, "waiting")}` : `${live} live`;
  });
  const hidden = computed(() => sc.sessions.value.filter((session) => session.archived).length);

  return { cards, meta, head, hidden, archive };
}
