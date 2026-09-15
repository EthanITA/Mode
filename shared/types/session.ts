import type { Pipeline, Slot } from "./mode.ts"

export type SessionAgent = { name: string; color: string }

export type SessionStatus = "busy" | "idle"

export interface PreviewCard {
  slug: string
  x: number
  y: number
  width?: number
}

export interface SessionPreview {
  cards: PreviewCard[]
  notes: { x: number; y: number; width?: number }[]
}

export interface SessionLane {
  name: "review" | "blocked" | "working" | "done"
  // Set when `claude agents` could not be run and the lane came off the job file, which disagrees.
  derived?: boolean
}

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
  lane?: SessionLane
  // No background job owns this key: history the sidecar kept, not a conversation `claude agents` lists.
  archived?: boolean
  startedAt?: number
  preview?: SessionPreview
}
