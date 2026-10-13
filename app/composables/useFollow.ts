import type { FollowTarget } from "~~/shared/types/review";

export interface FollowOptions {
  /** Jump on the very first read too, for a page that has no conversation of its own to stay on. */
  isEager?: boolean;
}

export type FollowPlace = Pick<FollowTarget, "face" | "key" | "slug">;

export interface Follow {
  listen: (options?: FollowOptions) => void;
  /** Goes there even while pinned, since a person asked for it rather than Claude Code. */
  show: (place: FollowPlace) => void;
}

export function useFollow(): Follow {
  const sc = useSidecar();
  const chrome = useChrome();
  const route = useRoute();
  const follow = $follow();

  function show(place: FollowPlace): void {
    const face = FACES.find((one) => one === (place.slug ? "artifacts" : place.face));
    if (face) chrome.view.set(face);
    follow.opening = place.slug;
    if (!place.key || place.key === sc.sessionKey.value) return;
    // Following leaves no trail, so Back never walks through every conversation Claude Code pointed at.
    void navigateTo(`/c/${place.key}`, { replace: true });
  }

  function go(next: FollowTarget): void {
    if (follow.isPinned) return;
    if (next.key) show(next);
    else if (next.source === "terminal" && route.path !== "/") void navigateTo("/", { replace: true });
  }

  // Otherwise the first read is a baseline, so a conversation opened by hand stays put until Claude Code points elsewhere.
  function listen({ isEager = false }: FollowOptions = {}): void {
    let source: EventSource | undefined;
    let retry = 0;
    let isBaseline = !follow.claimLanding(route.path) && !isEager;
    const connect = (): void => {
      source = new EventSource("/api/follow/stream");
      source.addEventListener("follow", (event: MessageEvent<string>) => {
        follow.target = JSON.parse(event.data) as FollowTarget;
        if (!isBaseline) go(follow.target);
        isBaseline = false;
      });
      // A restarting server can answer with its loading page, which closes an EventSource for good.
      source.addEventListener("error", () => {
        if (source?.readyState === EventSource.CLOSED) retry = window.setTimeout(connect, 2000);
      });
    };
    connect();
    watch(
      () => follow.isPinned,
      (isPinned) => {
        if (!isPinned) go(follow.target);
      },
    );
    onScopeDispose(() => {
      window.clearTimeout(retry);
      source?.close();
    });
  }

  return { listen, show };
}
