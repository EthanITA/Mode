import { createSharedComposable, useLocalStorage } from "@vueuse/core";
import type { Ref } from "vue";

export type Theme = "dark" | "light";

export interface ThemeSwitch {
  theme: Ref<Theme>;
  toggle: () => void;
}

// The key the boot script in nuxt.config reads, so a reload paints the chosen theme before Vue mounts.
export const useTheme = createSharedComposable((): ThemeSwitch => {
  const theme = useLocalStorage<Theme>("cela-theme", "light");
  watchEffect(() => document.documentElement.setAttribute("data-theme", theme.value));
  return {
    theme,
    toggle: () => {
      theme.value = theme.value === "dark" ? "light" : "dark";
    },
  };
});
