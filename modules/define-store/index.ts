import { addVitePlugin, defineNuxtModule } from "@nuxt/kit";
import { injectStoreId } from "./inject-id.ts";

export default defineNuxtModule({
  meta: { name: "define-store" },
  setup(_options, nuxt) {
    // Local modules load after the modules array, so Pinia's defineStore is already in the list to drop.
    nuxt.hook("imports:extend", (imports) => {
      const pinia = imports.findIndex((entry) => entry.name === "defineStore" && entry.from.includes("@pinia/nuxt"));
      if (pinia !== -1) imports.splice(pinia, 1);
    });

    addVitePlugin({
      enforce: "pre",
      name: "define-store:id",
      transform(code, file) {
        if (!file.includes("/app/stores/")) return;
        const next = injectStoreId(code);
        if (next !== code) return { code: next, map: null };
      },
    });
  },
});
