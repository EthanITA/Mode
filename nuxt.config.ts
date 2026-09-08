import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import tailwindAutoReference from "vite-plugin-vue-tailwind-auto-reference";

export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  // Non-negotiable: this whole app renders client side, never on the server.
  ssr: false,
  // The app outranks the package: without it, adding a name the package also has
  // silently reskins every call site using that tag.
  components: [
    {
      path: fileURLToPath(
        new URL("../cela/packages/design/components", import.meta.url),
      ),
      prefix: "Ui",
      priority: 0,
    },
    { path: "~/components", priority: 10 },
  ],
  css: ["~/assets/css/main.css", "~/assets/css/sidecar.css"],
  // A scoped <style> block is its own Tailwind entry point, so every SFC needs an
  // @reference to the theme before it can @apply anything from the package.
  vite: {
    plugins: [
      tailwindAutoReference(["./assets/css/main.css"]),
      tailwindcss(),
    ],
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
