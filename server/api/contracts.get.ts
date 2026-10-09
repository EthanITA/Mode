import { Mode } from "~~/lib/mode/index.ts";
import type { Contracts } from "../../shared/types/mode";

export default defineEventHandler((): Contracts => {
  const all = Mode.contracts();
  return { modes: all.filter((c) => c.axis === "mode"), styles: all.filter((c) => c.axis === "style") };
});
