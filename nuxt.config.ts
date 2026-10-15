import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import tailwindAutoReference from "vite-plugin-vue-tailwind-auto-reference";

export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  // Non-negotiable: this whole app renders client side, never on the server.
  ssr: false,
  // Its own port, so a dev server on the usual 3000 never takes it; read it at sidecar.localhost:4747.
  devServer: { port: 4747 },
  // The app outranks the package: without it, adding a name the package also has
  // silently reskins every call site using that tag.
  components: [
    {
      path: fileURLToPath(new URL("node_modules/@cela/design/components", import.meta.url)),
      prefix: "Ui",
      priority: 0,
    },
    { path: "~/components", priority: 10 },
  ],
  modules: ["@comark/nuxt", "@pinia/nuxt", "./app/utils/define-store/module"],
  // Nitro scans server/utils/** wholesale. Test-only modules are not server surface, and two
  // __fixtures__/env.ts both exporting useFixtures is a collision the scan cannot resolve.
  nitro: {
    imports: {
      dirs: ["!server/utils/**/__fixtures__/**", "!server/utils/**/*.test.ts"],
    },
  },
  css: ["~/assets/css/main.css"],
  // Each scoped <style> compiles alone, so it needs an @reference to main.css to @apply the theme.
  vite: {
    plugins: [tailwindAutoReference(["./assets/css/main.css"]), tailwindcss()],
  },
  app: {
    head: {
      title: "Claude Code Sidecar",
      script: [
        {
          // Stamped before Vue mounts so a dark-OS viewer never sees a light flash first.
          innerHTML: `(function(){try{var t=localStorage.getItem("cela-theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`,
        },
      ],
    },
  },
});
