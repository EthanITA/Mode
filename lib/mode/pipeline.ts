import type { Axis, Pipeline, PipelineStep } from "../../shared/types/mode.ts"
import { AUTO } from "./constants.ts"
import { Flow } from "./contracts.ts"
import { declared, held } from "./state.ts"

// An event stops at the first required evented step it has not passed, so an early commit cannot finish `deliver@commit`.
export function furthest(axis: Axis, sid: string | undefined, drawn: PipelineStep[]): number {
  const recorded = declared(axis, sid)
  let at = 0
  let blocked = false
  drawn.forEach(({ label, gate, event }, i) => {
    if (recorded.has(label.toLowerCase())) {
      at = i + 1
      blocked = false
    } else if (!event) {
      return
    } else if (recorded.has(event) && !blocked) {
      at = i + 1
    } else if (!gate) {
      blocked = true
    }
  })
  return at
}

function drawnFor(axis: Axis, sid?: string): { name: string; drawn: PipelineStep[] } {
  const name = held(axis, sid)
  return { name, drawn: name && name !== AUTO ? Flow.steps(axis, name) : [] }
}

export function pipelineFor(sid?: string): Pipeline | undefined {
  const { drawn } = drawnFor("mode", sid)
  if (!drawn.length) return undefined
  const labels = drawn.map((step) => step.label)
  const at = furthest("mode", sid, drawn)
  return { axis: "mode", steps: labels, done: labels.slice(0, at), current: labels[at], next: labels[at + 1], complete: at >= labels.length }
}

// Where the pipeline stands, in the words a turn is told it. Empty when none is declared.
export function position(axis: Axis, sid?: string): string {
  const { name, drawn } = drawnFor(axis, sid)
  if (!drawn.length) return ""
  const at = furthest(axis, sid, drawn)
  if (at >= drawn.length) return `Pipeline complete: all ${drawn.length} steps of ${name} are recorded.`
  const here = drawn[at]?.label ?? ""
  const behind = drawn.slice(0, at).map((step) => step.label).join(", ")
  const ahead = drawn[at + 1]?.label ?? ""
  const said = ((behind ? `Done: ${behind}. ` : "") + (ahead ? `Next: ${ahead}.` : "")).trim()
  return [`Pipeline, step ${at + 1} of ${drawn.length}: ${here}.`, ...(said ? [said] : []), `Record with \`mode ${axis} done ${here}\`, or say which step you are on.`].join("\n")
}

export function stepReport(axis: Axis, sid: string | undefined, tsv: boolean): string | undefined {
  const { name, drawn } = drawnFor(axis, sid)
  if (!drawn.length) return undefined
  if (!tsv) return position(axis, sid)
  const at = furthest(axis, sid, drawn)
  const rows = drawn.map(({ label, gate }, i) => `step\t${label}\t${gate ? 1 : 0}\t${i < at ? "done" : i === at ? "here" : "next"}`)
  return [...rows, ...Flow.arcs(axis, name, drawn).map(([from, to]) => `loop\t${from}\t${to}`)].join("\n")
}
