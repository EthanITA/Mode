import { vIslandPop } from "~/directives/island-pop";
import { vLiquidGlass } from "~/directives/liquid-glass";

export default defineNuxtPlugin((nuxt) => {
  nuxt.vueApp.directive("island-pop", vIslandPop);
  nuxt.vueApp.directive("liquid-glass", vLiquidGlass);
});
