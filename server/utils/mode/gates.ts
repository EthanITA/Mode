import { AUTO, GATES } from "./constants.ts"
import { metaOf, truthy } from "./contracts.ts"
import { approvedSlug, guardsArmed, held, redStanding } from "./state.ts"
import type { Gate } from "./types.ts"

export function gatesFor(sid?: string): Gate[] {
  const name = held("mode", sid)
  const meta = name && name !== AUTO ? metaOf("mode", name) : {}
  const armed = guardsArmed()
  const out: Gate[] = []
  for (const key of Object.keys(GATES).sort()) {
    const gate = GATES[key]
    if (!gate) continue
    const { what, switchable } = gate
    if (!truthy(meta, key)) {
      out.push({ name: key, state: "open", reason: `not declared by ${name || "an empty mode slot"}` })
      continue
    }
    if (switchable && !armed) {
      out.push({ name: key, state: "open", reason: "declared but disarmed by guards: off in config.json" })
      continue
    }
    if (key === "no-dispatch-without-approval") {
      const slug = approvedSlug(sid)
      out.push(
        slug
          ? { name: key, state: "open", reason: `${slug} is approved` }
          : { name: key, state: "shut", reason: `nothing is approved under ${name}, so ${what} is refused` },
      )
    } else {
      out.push(
        redStanding(sid)
          ? { name: key, state: "open", reason: "a red is standing" }
          : { name: key, state: "shut", reason: `no red is standing, so ${what} is refused` },
      )
    }
  }
  return out
}
