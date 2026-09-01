import type { Contract } from "../../server/utils/mode/index.ts"

export type { Axis, Contract, ContractLoop, Gate, How, Pipeline, PipelineStep, Slot, Why } from "../../server/utils/mode/index.ts"

export interface Contracts {
  modes: Contract[]
  styles: Contract[]
}
