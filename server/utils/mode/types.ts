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
