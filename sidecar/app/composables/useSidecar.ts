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
  openThread: Maybe<string>;
  panelOpen: Ref<boolean>;
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
    openThread: maybeState<string>("sc:open-thread"),
    panelOpen: useState<boolean>("sc:panel-open", () => true),
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

  onMounted(() => {
    void pullOnce();
    // A sidecar to running conversations is wrong the moment it stops looking.
    const timer = window.setInterval(() => void pullSessions().catch(() => undefined), REFRESH_MS);
    onScopeDispose(() => window.clearInterval(timer));
  });

  // The artifact list belongs to the session, so the mount follows the tab.
  watch(
    [() => sc.sessionKey.value, () => sc.sessions.value],
    () => {
      const slugs = sc.sessions.value.find((s) => s.key === sc.sessionKey.value)?.artifacts ?? [];
      if (!sc.slug.value || !slugs.includes(sc.slug.value)) sc.slug.value = slugs[0];
    },
    { immediate: true },
  );

  watch(
    () => sc.slug.value,
    async (slug) => {
      sc.openThread.value = undefined;
      if (!slug) {
        sc.artifact.value = undefined;
        return;
      }
      try {
        sc.artifact.value = await $fetch<ArtifactDetail>(`/api/artifacts/${slug}`);
      } catch {
        sc.artifact.value = undefined;
      }
    },
    { immediate: true },
  );
}
