export const useArtifactFullscreenStore = defineStore("artifact-fullscreen", () => {
  const isFull = ref(false);

  return { isFull };
});
