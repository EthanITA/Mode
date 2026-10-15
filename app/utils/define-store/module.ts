import { addVitePlugin, createResolver, defineNuxtModule } from "@nuxt/kit";
import { injectStoreId } from "./inject-id.ts";

export default defineNuxtModule({
  meta: { name: "define-store" },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url);

    // Nuxt scans only the top level of utils, so this folder registers its own defineStore in Pinia's place.
    nuxt.hook("imports:extend", (imports) => {
      const pinia = imports.findIndex((entry) => entry.name === "defineStore" && entry.from.includes("@pinia/nuxt"));
      if (pinia !== -1) imports.splice(pinia, 1, { name: "defineStore", from: resolve("./index.ts") });
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
