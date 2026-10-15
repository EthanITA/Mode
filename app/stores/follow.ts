import type { FollowTarget } from "~~/shared/types/review";

export interface FollowOptions {
  /** Jump on the very first read too, for a page that has no conversation of its own to stay on. */
  isEager?: boolean;
}

export type FollowPlace = Pick<FollowTarget, "face" | "key" | "slug">;

// A page that never reports finishing still lifts the veil, rather than leaving the sidecar covered.
const SWITCH_CAP_MS = 2000;

function wait(ms: number): Promise<void> {
  return new Promise((done) => window.setTimeout(done, ms));
}

export const $follow = defineStore(() => {
  const sc = useSidecar();
  const chrome = useChrome();
  const router = useRouter();
  const nuxtApp = useNuxtApp();
  const target = ref<FollowTarget>({ source: "none" });
  /** The artifact Claude Code asked to show, held until Artifacts mounts and opens it. */
  const opening = ref<string>();
  const isSwitching = ref(false);
  let switches = 0;
  let landing: string | undefined = window.location.pathname;

  function claimLanding(path: string): boolean {
    const isLanding = path === landing;
    landing = undefined;
    return isLanding;
  }

  function show(place: FollowPlace): void {
    const face = FACES.find((one) => one === (place.slug ? "artifacts" : place.face));
    if (face) chrome.view.set(face);
    opening.value = place.slug;
    // The route, not sessionKey, because Listening keeps the last conversation's key while showing none.
    if (!place.key || place.key === router.currentRoute.value.params.key) return;
    // Following leaves no trail, so Back never walks through every conversation Claude Code pointed at.
    void navigateTo(`/c/${place.key}`, { replace: true });
  }

  async function switchTo(change: () => void): Promise<void> {
    const mine = ++switches;
    isSwitching.value = true;
    // The veil's fade-in, so the old page is covered before it changes.
    await wait(Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--duration-fast")));
    if (mine !== switches) return;
    const rendered = new Promise<void>((done) => nuxtApp.hooks.hookOnce("page:finish", () => done()));
    change();
    await Promise.race([rendered, wait(SWITCH_CAP_MS)]);
    if (mine === switches) isSwitching.value = false;
  }

  function go(next: FollowTarget): void {
    const route = router.currentRoute.value;
    if (next.key && next.key !== route.params.key) void switchTo(() => show(next));
    else if (next.key) show(next);
    else if (next.source === "terminal" && route.path !== "/")
      void switchTo(() => void navigateTo("/", { replace: true }));
  }

  // Otherwise the first read is a baseline, so a conversation opened by hand stays put until Claude Code points elsewhere.
  function listen({ isEager = false }: FollowOptions = {}): void {
    let source: EventSource | undefined;
    let retry = 0;
    let isBaseline = !claimLanding(router.currentRoute.value.path) && !isEager;
    const connect = (): void => {
      source = new EventSource("/api/follow/stream");
      source.addEventListener("follow", (event: MessageEvent<string>) => {
        target.value = JSON.parse(event.data) as FollowTarget;
        if (!isBaseline) go(target.value);
        isBaseline = false;
      });
      // A restarting server can answer with its loading page, which closes an EventSource for good.
      source.addEventListener("error", () => {
        if (source?.readyState === EventSource.CLOSED) retry = window.setTimeout(connect, 2000);
      });
    };
    connect();
    onScopeDispose(() => {
      window.clearTimeout(retry);
      source?.close();
    });
  }

  return { isSwitching, listen, opening, show, target };
});
