import type { Ref } from "vue";
import type { FollowTarget } from "~~/shared/types/review";

export interface Follow {
  listen: () => void;
  pinned: Ref<boolean>;
  target: Ref<FollowTarget>;
}

export function useFollow(): Follow {
  const sc = useSidecar();
  const target = useState<FollowTarget>("rv:follow", () => ({ source: "none" }));
  const pinned = useState("rv:pinned", () => false);

  function go(next: FollowTarget): void {
    if (pinned.value || !next.key || next.key === sc.sessionKey.value) return;
    void navigateTo(`/c/${next.key}`);
  }

  // The first read is a baseline, so a review opened by hand stays put until you switch Terminal tabs.
  function listen(): void {
    const source = new EventSource("/api/follow/stream");
    let isBaseline = true;
    source.addEventListener("follow", (event: MessageEvent<string>) => {
      target.value = JSON.parse(event.data) as FollowTarget;
      if (!isBaseline) go(target.value);
      isBaseline = false;
    });
    watch(pinned, (isPinned) => {
      if (!isPinned) go(target.value);
    });
    onScopeDispose(() => source.close());
  }

  return { listen, pinned, target };
}
