export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  // Non-negotiable: this whole app renders client side, never on the server.
  ssr: false,
  css: ["~/assets/css/cela.css", "~/assets/css/surface.css"],
  app: {
    head: {
      title: "Mode sidecar",
      script: [
        {
          // Stamped before Vue mounts so a dark-OS viewer never sees a light flash first.
          innerHTML: `(function(){try{var t=localStorage.getItem("cela-theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`,
        },
      ],
    },
  },
});
