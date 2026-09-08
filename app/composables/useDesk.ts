import type { BoardSummary } from "~~/shared/types/board";
import type { Slot, Why } from "~~/shared/types/mode";
import type { LiveSession } from "~~/shared/types/session";
import { homePath, plural, relativeAge } from "~/utils/label";
import { tintOf, type Tint } from "~/utils/tint";

export interface DeskArtifact {
  slug: string;
  title: string;
  isNew: boolean;
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
}

const SEEN_KEY = "sc:desk-seen";

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

function shutGates(why: Why | undefined): number {
  return why?.gates.filter((gate) => gate.state === "shut").length ?? 0;
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
} {
  const sc = useSidecar();
  const boards = boardCounts();
  const titles = computed(() => new Map(sc.catalogue.value.map((meta) => [meta.slug, meta.title])));

  const cards = computed<DeskCard[]>(() => {
    const seen = readSeen();
    return sc.sessions.value.map((session: LiveSession) => {
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
      };
    });
  });

  const meta = computed(() => plural(cards.value.length, "conversation"));
  const head = computed(() => {
    const live = cards.value.filter((card) => card.live).length;
    const waiting = cards.value.filter((card) => card.waiting).length;
    return waiting ? `${live} live · ${plural(waiting, "waiting")}` : `${live} live`;
  });

  return { cards, meta, head };
}
