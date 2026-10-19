import type { ComputedRef, Ref, WritableComputedRef } from "vue";
import type { ArtifactDetail, ArtifactMeta } from "~~/shared/types/artifact";
import type { LiveSession } from "~~/shared/types/session";

/** `?:` cannot express absence inside a generic, so every absent-by-default ref goes through here. */
export type Maybe<T> = Ref<T | undefined>;
export type MaybeComputed<T> = ComputedRef<T | undefined>;

function maybeState<T>(key: string): Maybe<T> {
  return useState<T | undefined>(key);
}

export interface Sidecar {
  artifact: Maybe<ArtifactDetail>;
  catalogue: Ref<ArtifactMeta[]>;
  failure: Maybe<string>;
  /** The slug whose read failed, so a reader tells a missing page from one still on its way. */
  missing: Maybe<string>;
  ready: Ref<boolean>;
  sessionKey: Maybe<string>;
  sessions: Ref<LiveSession[]>;
  slug: Maybe<string>;
}

const REFRESH_MS = 5000;

export function useSidecar(): Sidecar {
  return {
    artifact: maybeState<ArtifactDetail>("sc:artifact"),
    catalogue: useState<ArtifactMeta[]>("sc:catalogue", () => []),
    failure: maybeState<string>("sc:failure"),
    missing: maybeState<string>("sc:missing"),
    ready: useState<boolean>("sc:ready", () => false),
    sessionKey: maybeState<string>("sc:session-key"),
    sessions: useState<LiveSession[]>("sc:sessions", () => []),
    slug: maybeState<string>("sc:slug"),
  };
}

export function useConversationPick(name: string): WritableComputedRef<string | undefined> {
  const sc = useSidecar();
  const picks = useState<Partial<Record<string, string>>>(name, () => ({}));
  return computed({
    get: () => (sc.sessionKey.value ? picks.value[sc.sessionKey.value] : undefined),
    set: (pick) => {
      if (sc.sessionKey.value) picks.value = { ...picks.value, [sc.sessionKey.value]: pick };
    },
  });
}

/** Called once by the page. Loads everything, then keeps the live half fresh. */
export function loadSidecar(): void {
  const sc = useSidecar();

  function pick(): void {
    const sessions = sc.sessions.value;
    if (sc.sessionKey.value && sessions.some((s) => s.key === sc.sessionKey.value)) return;
    const first = sessions.find((s) => s.live) ?? sessions.find((s) => s.artifacts.length) ?? sessions[0];
    sc.sessionKey.value = first?.key;
  }

  async function pullSessions(): Promise<void> {
    sc.sessions.value = await $fetch<LiveSession[]>("/api/sessions");
    pick();
  }

  // The full list grows with every conversation ever had, so the poll asks only for what can still change.
  async function pullLive(): Promise<void> {
    const fresh = await $fetch<LiveSession[]>("/api/sessions", {
      query: { scope: "live", key: sc.sessionKey.value },
    });
    const byKey = new Map(fresh.map((s) => [s.key, s]));
    const known = new Set(sc.sessions.value.map((s) => s.key));
    const listed = new Set(sc.sessions.value.find((s) => s.key === sc.sessionKey.value)?.artifacts);
    // A chat's links are recorded with no event, so the catalogue would never hold them otherwise.
    if (byKey.get(sc.sessionKey.value ?? "")?.artifacts.some((slug) => !listed.has(slug)))
      sc.catalogue.value = await $fetch<ArtifactMeta[]>("/api/artifacts");
    // Left out of a live answer means its process has ended.
    const kept = sc.sessions.value.map(
      (s) => byKey.get(s.key) ?? (s.live ? { ...s, live: false, status: undefined } : s),
    );
    sc.sessions.value = [...fresh.filter((s) => !known.has(s.key)), ...kept].sort(sessionOrder);
    pick();
  }

  async function pullOnce(): Promise<void> {
    try {
      sc.catalogue.value = await $fetch<ArtifactMeta[]>("/api/artifacts");
      await pullSessions();
      sc.failure.value = undefined;
    } catch (error) {
      sc.failure.value = error instanceof Error ? error.message : String(error);
    } finally {
      sc.ready.value = true;
    }
  }

  // After a failure the catalogue may never have loaded, so recovery pulls everything again.
  async function poll(): Promise<void> {
    if (sc.failure.value) return pullOnce();
    try {
      await pullLive();
    } catch (error) {
      sc.failure.value = error instanceof Error ? error.message : String(error);
    }
  }

  const events = useEvents();
  // The catalogue is read once, so a page made after that would never list without this.
  events.on("artifact.created", () => {
    void $fetch<ArtifactMeta[]>("/api/artifacts")
      .then((catalogue) => (sc.catalogue.value = catalogue))
      .catch(() => {});
  });
  // A restart can be over before the next poll, so a dropped stream checks at once.
  events.onLost(() => void poll());

  onMounted(() => {
    void pullOnce();
    // A sidecar to running conversations is wrong the moment it stops looking.
    const timer = window.setInterval(() => void poll(), REFRESH_MS);
    onScopeDispose(() => window.clearInterval(timer));
  });

  // Any page in the catalogue may be held, since Files opens one this conversation never stamped.
  watch(
    [() => sc.sessionKey.value, () => sc.sessions.value, () => sc.catalogue.value],
    () => {
      const held = sc.slug.value;
      const slugs = sc.sessions.value.find((s) => s.key === sc.sessionKey.value)?.artifacts ?? [];
      const isKnown = !!held && (slugs.includes(held) || sc.catalogue.value.some((meta) => meta.slug === held));
      if (!isKnown) sc.slug.value = slugs[0];
    },
    { immediate: true },
  );

  watch(
    () => sc.slug.value,
    async (slug) => {
      if (!slug) {
        sc.artifact.value = undefined;
        return;
      }
      const got = await $fetch<ArtifactDetail>(`/api/artifacts/${slug}`).catch(() => undefined);
      // Two picks in one tick fetch twice, and only the one still held may land.
      if (sc.slug.value !== slug) return;
      sc.artifact.value = got;
      sc.missing.value = got ? undefined : slug;
    },
    { immediate: true },
  );
}
