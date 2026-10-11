import { useLocalStorage } from "@vueuse/core";

// Review starts on the diff, because its hunks are what get approved there.
export const $preview = defineStore(() => {
  const inFiles = useLocalStorage("sc:preview:files", true);
  const inReview = useLocalStorage("sc:preview:review", false);
  const isSynced = useLocalStorage("sc:preview:synced", true);

  return { inFiles, inReview, isSynced };
});
