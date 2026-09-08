import { AXES } from "./constants.ts"
import { type ContractLoop, type PipelineStep, metaOf, names, pipelineLoops, pipelineSteps } from "./contracts.ts"

export type Contract = {
  axis: "mode" | "style"
  name: string
  summary?: string
  color?: string
  steps: PipelineStep[]
  loops: ContractLoop[]
}

export function contracts(): Contract[] {
  const out: Contract[] = []
  for (const axis of AXES) {
    for (const name of names(axis)) {
      const meta = metaOf(axis, name)
      const steps = pipelineSteps(axis, name)
      out.push({ axis, name, summary: meta.summary, color: meta.color, steps, loops: pipelineLoops(axis, name, steps) })
    }
  }
  return out
}
