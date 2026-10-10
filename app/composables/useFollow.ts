import type { Ref } from "vue";
import type { Maybe } from "~/composables/useSidecar";
import type { FollowTarget } from "~~/shared/types/review";

export interface FollowOptions {
  /** Jump on the very first read too, for a page that has no conversation of its own to stay on. */
  isEager?: boolean;
}

export type FollowPlace = Pick<FollowTarget, "face" | "key" | "slug">;

export interface Follow {
  listen: (options?: FollowOptions) => void;
  /** The artifact Claude Code asked to show, held until Artifacts mounts and opens it. */
  opening: Maybe<string>;
  pinned: Ref<boolean>;
  /** Goes there even while pinned, since a person asked for it rather than Claude Code. */
  show: (place: FollowPlace) => void;
  target: Ref<FollowTarget>;
}

export function useFollow(): Follow {
  const sc = useSidecar();
  const chrome = useChrome();
  const target = useState<FollowTarget>("rv:follow", () => ({ source: "none" }));
  const opening = useState<string | undefined>("rv:opening");
  const pinned = useState("rv:pinned", () => false);

  function show(place: FollowPlace): void {
    const face = FACES.find((one) => one === (place.slug ? "artifacts" : place.face));
    if (face) chrome.view.set(face);
    opening.value = place.slug;
    if (!place.key || place.key === sc.sessionKey.value) return;
    // Following leaves no trail, so Back never walks through every conversation Claude Code pointed at.
    void navigateTo(`/c/${place.key}`, { replace: true });
  }

  function go(next: FollowTarget): void {
    if (pinned.value || !next.key) return;
    show(next);
  }

  // Otherwise the first read is a baseline, so a conversation opened by hand stays put until Claude Code points elsewhere.
  function listen({ isEager = false }: FollowOptions = {}): void {
    let source: EventSource | undefined;
    let retry = 0;
    let isBaseline = !isEager;
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
    watch(pinned, (isPinned) => {
      if (!isPinned) go(target.value);
    });
    onScopeDispose(() => {
      window.clearTimeout(retry);
      source?.close();
    });
  }

  return { listen, opening, pinned, show, target };
}
