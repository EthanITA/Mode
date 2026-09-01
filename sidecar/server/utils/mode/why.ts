import { gatesFor } from "./gates.ts"
import { resolveDir } from "./paths.ts"
import { pipelineFor } from "./pipeline.ts"
import { ruleState } from "./rules.ts"
import { sessionKey } from "./state.ts"
import { slotOf } from "./slot.ts"
import type { Why } from "./types.ts"

export function why(sid?: string, path?: string): Why {
  return {
    session: sessionKey(sid),
    path: resolveDir(path),
    slots: { mode: slotOf("mode", sid), style: slotOf("style", sid) },
    pipeline: pipelineFor(sid),
    gates: gatesFor(sid),
    rules: ruleState(sid),
  }
}
