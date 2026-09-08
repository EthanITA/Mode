import { readdirSync } from "node:fs"
import { pipelineFor } from "./pipeline.ts"
import { stateHome } from "./paths.ts"
import { slotOf } from "./slot.ts"
import type { Pipeline, Slot } from "./types.ts"

export type Session = { id: string; slots: { mode: Slot; style: Slot }; pipeline?: Pipeline }

export function sessions(): Session[] {
  let entries: string[]
  try {
    entries = readdirSync(stateHome())
  } catch {
    return []
  }
  const ids = new Set<string>()
  for (const entry of entries) {
    const id = /^session-([0-9a-f]{8})\./.exec(entry)?.[1]
    if (id) ids.add(id)
  }
  return [...ids].sort().map((id) => ({
    id,
    slots: { mode: slotOf("mode", id), style: slotOf("style", id) },
    pipeline: pipelineFor(id),
  }))
}
