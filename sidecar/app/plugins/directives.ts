import {
  vFade,
  vFlip,
  vIslandPop,
  vLiquidGlass,
  vPress,
  vReveal,
  vScrollReveal,
  vTweenCount,
} from "@cela/design";

export default defineNuxtPlugin((nuxt) => {
  nuxt.vueApp.directive("fade", vFade);
  nuxt.vueApp.directive("flip", vFlip);
  nuxt.vueApp.directive("island-pop", vIslandPop);
  nuxt.vueApp.directive("liquid-glass", vLiquidGlass);
  nuxt.vueApp.directive("press", vPress);
  nuxt.vueApp.directive("reveal", vReveal);
  nuxt.vueApp.directive("scroll-reveal", vScrollReveal);
  nuxt.vueApp.directive("tween-count", vTweenCount);
});
