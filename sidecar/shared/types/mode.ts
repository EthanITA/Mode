import type { Contract, Pipeline, Slot } from "../../server/utils/mode/index.ts"

export type { Axis, Contract, ContractLoop, Gate, How, Pipeline, PipelineStep, Slot, Why } from "../../server/utils/mode/index.ts"

// The session rail's row shape: id renamed for consistency with Why.session, pipeline awaits D1.
export interface SessionSummary {
  session: string
  slots: { mode: Slot; style: Slot }
  pipeline?: Pipeline
}

export interface Contracts {
  modes: Contract[]
  styles: Contract[]
}
