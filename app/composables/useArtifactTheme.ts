import { createSharedComposable, useLocalStorage } from "@vueuse/core";
import type { Ref } from "vue";

export type ArtifactTheme = "dark" | "light";

export interface ArtifactLook {
  theme: Ref<ArtifactTheme>;
  toggle: () => void;
}

// The page's own light or dark, apart from the sidecar's, so flipping an artifact never repaints the app around it.
export const useArtifactTheme = createSharedComposable((): ArtifactLook => {
  const theme = useLocalStorage<ArtifactTheme>("sc:artifact-theme", "light");
  return {
    theme,
    toggle: () => {
      theme.value = theme.value === "dark" ? "light" : "dark";
    },
  };
});
