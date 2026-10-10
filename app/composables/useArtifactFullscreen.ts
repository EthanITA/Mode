import type { Ref } from "vue";

// Asked for by the Files preview and answered by the top row, whose X closes it.
export function useArtifactFullscreen(): Ref<boolean> {
  return useState("fl:fullscreen", () => false);
}
