import { createSharedComposable, useLocalStorage } from "@vueuse/core";
import type { RemovableRef } from "@vueuse/core";

export const PANE_WIDTH = 340;

// One width for the left pane of every face, so resizing it in Files carries over to Review, History and Artifacts.
export const usePaneWidth = createSharedComposable(
  (): RemovableRef<number> => useLocalStorage("sc:pane", PANE_WIDTH),
);
