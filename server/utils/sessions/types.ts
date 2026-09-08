import type { Pipeline, Slot } from "../mode/types.ts"

export type SessionAgent = { name: string; color: string }

export type SessionStatus = "busy" | "idle"

export interface LiveSession {
  id: string
  key: string
  name?: string
  cwd: string
  live: boolean
  color?: string
  slots: { mode: Slot; style: Slot }
  pipeline?: Pipeline
  artifacts: string[]
  agents?: SessionAgent[]
  // Additive to the frozen contract: a narrower type on the client ignores these at runtime.
  status?: SessionStatus
  gitBranch?: string
  lastActive?: number
}
