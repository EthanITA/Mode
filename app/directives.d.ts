import type {
  vFade,
  vFlip,
  vIslandPop,
  vLiquidGlass,
  vPress,
  vReveal,
  vScrollReveal,
  vTweenCount,
} from "@cela/design";

declare module "@vue/runtime-core" {
  export interface GlobalDirectives {
    vFade: typeof vFade;
    vFlip: typeof vFlip;
    vIslandPop: typeof vIslandPop;
    vLiquidGlass: typeof vLiquidGlass;
    vPress: typeof vPress;
    vReveal: typeof vReveal;
    vScrollReveal: typeof vScrollReveal;
    vTweenCount: typeof vTweenCount;
  }
}
