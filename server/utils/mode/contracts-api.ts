import type { Contract } from "../../../shared/types/mode.ts"
import { AXES } from "./constants.ts"
import { Flow, metaOf, names } from "./contracts.ts"

export function contracts(): Contract[] {
  const out: Contract[] = []
  for (const axis of AXES) {
    for (const name of names(axis)) {
      const meta = metaOf(axis, name)
      const steps = Flow.steps(axis, name)
      out.push({ axis, name, summary: meta.summary, color: meta.color, steps, loops: Flow.loops(axis, name, steps) })
    }
  }
  return out
}
