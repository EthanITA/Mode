import type { ComputedRef, Ref } from "vue";
import type { ArtifactDetail, ArtifactMeta } from "~~/shared/types/artifact";
import type { Contracts, Why } from "~~/shared/types/mode";
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
  contracts: Ref<Contracts>;
  failure: Maybe<string>;
  ready: Ref<boolean>;
  sessionKey: Maybe<string>;
  sessions: Ref<LiveSession[]>;
  slug: Maybe<string>;
  whys: Ref<Record<string, Why>>;
}

const REFRESH_MS = 5000;

export function useSidecar(): Sidecar {
  return {
    artifact: maybeState<ArtifactDetail>("sc:artifact"),
    catalogue: useState<ArtifactMeta[]>("sc:catalogue", () => []),
    contracts: useState<Contracts>("sc:contracts", () => ({ modes: [], styles: [] })),
    failure: maybeState<string>("sc:failure"),
    ready: useState<boolean>("sc:ready", () => false),
    sessionKey: maybeState<string>("sc:session-key"),
    sessions: useState<LiveSession[]>("sc:sessions", () => []),
    slug: maybeState<string>("sc:slug"),
    whys: useState<Record<string, Why>>("sc:whys", () => ({})),
  };
}

async function readWhys(sessions: LiveSession[]): Promise<Record<string, Why>> {
  const pairs = await Promise.all(
    sessions.map(async (session): Promise<[string, Why] | undefined> => {
      try {
        return [session.key, await $fetch<Why>("/api/why", { query: { session: session.key } })];
      } catch {
        return undefined; // one unreadable session must not blank the whole rail
      }
    }),
  );
  return Object.fromEntries(pairs.filter((pair): pair is [string, Why] => Boolean(pair)));
}

/** Called once by the page. Loads everything, then keeps the live half fresh. */
export function loadSidecar(): void {
  const sc = useSidecar();

  async function pullSessions(): Promise<void> {
    const sessions = await $fetch<LiveSession[]>("/api/sessions");
    sc.sessions.value = sessions;
    sc.whys.value = await readWhys(sessions);
    if (!sc.sessionKey.value || !sessions.some((s) => s.key === sc.sessionKey.value)) {
      const pick = sessions.find((s) => s.live) ?? sessions.find((s) => s.artifacts.length) ?? sessions[0];
      sc.sessionKey.value = pick?.key;
    }
  }

  async function pullOnce(): Promise<void> {
    try {
      const [catalogue, contracts] = await Promise.all([
        $fetch<ArtifactMeta[]>("/api/artifacts"),
        $fetch<Contracts>("/api/contracts"),
      ]);
      sc.catalogue.value = catalogue;
      sc.contracts.value = contracts;
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
      await pullSessions();
    } catch (error) {
      sc.failure.value = error instanceof Error ? error.message : String(error);
    }
  }

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
      if (sc.slug.value === slug) sc.artifact.value = got;
    },
    { immediate: true },
  );
}
