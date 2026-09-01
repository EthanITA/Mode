import { AUTO } from "./constants.ts"
import { type PipelineStep, pipelineSteps } from "./contracts.ts"
import { declared, held } from "./state.ts"
import type { Pipeline } from "./types.ts"

export function furthest(sid: string | undefined, steps: PipelineStep[]): number {
  const recorded = declared("mode", sid)
  let at = 0
  let blocked = false
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (!step) continue
    const { label, gate, event } = step
    if (recorded.has(label.toLowerCase())) {
      at = i + 1
      blocked = false
    } else if (!event) {
      continue
    } else if (recorded.has(event) && !blocked) {
      at = i + 1
    } else if (!gate) {
      blocked = true
    }
  }
  return at
}

export function pipelineFor(sid?: string): Pipeline | undefined {
  const name = held("mode", sid)
  const steps = name && name !== AUTO ? pipelineSteps("mode", name) : []
  if (!steps.length) return undefined
  const labels = steps.map((s) => s.label)
  const at = furthest(sid, steps)
  return {
    axis: "mode",
    steps: labels,
    done: labels.slice(0, at),
    current: at < labels.length ? labels[at] : undefined,
    next: at + 1 < labels.length ? labels[at + 1] : undefined,
    complete: at >= labels.length,
  }
}
