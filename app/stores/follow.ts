import type { FollowTarget } from "~~/shared/types/review";

export interface FollowOptions {
  /** Jump on the very first read too, for a page that has no conversation of its own to stay on. */
  isEager?: boolean;
}

export type FollowPlace = Pick<FollowTarget, "face" | "key" | "slug">;

export const $follow = defineStore(() => {
  const sc = useSidecar();
  const chrome = useChrome();
  const router = useRouter();
  const target = ref<FollowTarget>({ source: "none" });
  /** The artifact Claude Code asked to show, held until Artifacts mounts and opens it. */
  const opening = ref<string>();
  const isPinned = ref(false);
  let landing: string | undefined = window.location.pathname;

  function claimLanding(path: string): boolean {
    const isLanding = path === landing;
    landing = undefined;
    return isLanding;
  }

  /** Goes there even while pinned, since a person asked for it rather than Claude Code. */
  function show(place: FollowPlace): void {
    const face = FACES.find((one) => one === (place.slug ? "artifacts" : place.face));
    if (face) chrome.view.set(face);
    opening.value = place.slug;
    if (!place.key || place.key === sc.sessionKey.value) return;
    // Following leaves no trail, so Back never walks through every conversation Claude Code pointed at.
    void navigateTo(`/c/${place.key}`, { replace: true });
  }

  function go(next: FollowTarget): void {
    if (isPinned.value) return;
    if (next.key) show(next);
    else if (next.source === "terminal" && router.currentRoute.value.path !== "/")
      void navigateTo("/", { replace: true });
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
    watch(isPinned, (pinned) => {
      if (!pinned) go(target.value);
    });
    onScopeDispose(() => {
      window.clearTimeout(retry);
      source?.close();
    });
  }

  return { isPinned, listen, opening, show, target };
});
