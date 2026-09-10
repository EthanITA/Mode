export type Axis = "mode" | "style"

export type How = "typed" | "chosen" | "pinned" | "auto"

export type Slot = {
  name?: string
  how: How
  summary?: string
  color?: string
}

export type Pipeline = {
  axis: "mode"
  steps: string[]
  done: string[]
  current?: string
  next?: string
  complete: boolean
}

export type PipelineStep = { label: string; gate: boolean; event: string }

export type ContractLoop = { from: string; to: string }

export type Gate = {
  name: string
  state: "open" | "shut"
  reason: string
}

export type Why = {
  session: string
  path: string
  slots: { mode: Slot; style: Slot }
  pipeline?: Pipeline
  gates: Gate[]
  rules: { told: string[]; waiting: { name: string; until?: string }[] }
}

export type Contract = {
  axis: Axis
  name: string
  summary?: string
  color?: string
  steps: PipelineStep[]
  loops: ContractLoop[]
}

export interface Contracts {
  modes: Contract[]
  styles: Contract[]
}
