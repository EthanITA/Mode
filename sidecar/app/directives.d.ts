import type { vIslandPop } from "./directives/island-pop";
import type { vLiquidGlass } from "./directives/liquid-glass";

declare module "@vue/runtime-core" {
  export interface GlobalDirectives {
    vIslandPop: typeof vIslandPop;
    vLiquidGlass: typeof vLiquidGlass;
  }
}
