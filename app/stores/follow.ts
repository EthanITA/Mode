import type { FollowTarget } from "~~/shared/types/review";

export const $follow = defineStore(() => {
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

  return { claimLanding, isPinned, opening, target };
});
