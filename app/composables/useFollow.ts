import type { Ref } from "vue";
import type { FollowTarget } from "~~/shared/types/review";

export interface FollowOptions {
  /** Jump on the very first read too, for a page that has no conversation of its own to stay on. */
  isEager?: boolean;
}

export interface Follow {
  listen: (options?: FollowOptions) => void;
  pinned: Ref<boolean>;
  target: Ref<FollowTarget>;
}

export function useFollow(): Follow {
  const sc = useSidecar();
  const chrome = useChrome();
  const target = useState<FollowTarget>("rv:follow", () => ({ source: "none" }));
  const pinned = useState("rv:pinned", () => false);

  function go(next: FollowTarget): void {
    if (pinned.value || !next.key) return;
    const face = FACES.find((one) => one === next.face);
    if (face) chrome.view.set(face);
    if (next.key === sc.sessionKey.value) return;
    // Following leaves no trail, so Back never walks through every conversation Claude Code pointed at.
    void navigateTo(`/c/${next.key}`, { replace: true });
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

  return { listen, pinned, target };
}
