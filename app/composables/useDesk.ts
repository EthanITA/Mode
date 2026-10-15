import type { LiveSession } from "~~/shared/types/session";
import { nameOf } from "~/composables/useScreen";
import { homePath, relativeAge } from "~/utils/label";
import { tintOf, type Tint } from "~/utils/tint";

export interface DeskRow {
  key: string;
  title: string;
  ago: string;
  about: string;
  tint: Tint;
  live: boolean;
}

export interface Desk {
  rows: ComputedRef<DeskRow[]>;
  needs: ComputedRef<number>;
  working: ComputedRef<number>;
}

function needsYou(session: LiveSession): boolean {
  return session.lane?.name === "review" || session.lane?.name === "blocked";
}

export function ageOf(session: LiveSession): string {
  return relativeAge(session.lastActive ? new Date(session.lastActive).toISOString() : undefined);
}

export function placeOf(session: LiveSession): string {
  return [homePath(session.cwd), session.gitBranch].filter(Boolean).join(" · ");
}

// The conversations `claude agents` lists; the rest is history the jump palette still reaches.
export function useDesk(): Desk {
  const sc = useSidecar();
  const shown = computed(() =>
    sc.sessions.value
      .filter((session) => !session.archived)
      .sort((a, b) => Number(needsYou(b)) - Number(needsYou(a)) || (b.lastActive ?? 0) - (a.lastActive ?? 0)),
  );

  const rows = computed<DeskRow[]>(() =>
    shown.value.map((session) => ({
      key: session.key,
      title: nameOf(session),
      ago: ageOf(session),
      about: session.detail || placeOf(session),
      tint: tintOf(session.color, session.key),
      live: session.live,
    })),
  );

  const needs = computed(() => shown.value.filter(needsYou).length);
  const working = computed(() => shown.value.filter((session) => session.lane?.name === "working").length);

  return { rows, needs, working };
}
