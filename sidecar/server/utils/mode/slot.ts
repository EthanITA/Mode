import { AUTO, type Axis } from "./constants.ts"
import { metaOf } from "./contracts.ts"
import { held, sourceOf } from "./state.ts"
import type { Slot } from "./types.ts"

// Unset and literal `auto` both name no contract; a consumer renders "off" on a missing name.
export function slotOf(axis: Axis, sid?: string): Slot {
  const name = held(axis, sid)
  if (!name || name === AUTO) return { how: "auto" }
  const meta = metaOf(axis, name)
  return { name, how: sourceOf(axis, sid) || "typed", summary: meta.summary, color: meta.color }
}
