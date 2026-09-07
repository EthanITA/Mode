export type BaselineOrigin = "absent" | "exact" | "reconstructed" | "unknown"

export interface FileVersion {
  path: string
  turn: number
  at: number
  by: string
  sha: string
  bytes: number
  added: number
  removed: number
  created?: boolean
  deleted?: boolean
}

export interface FileVersions {
  path: string
  baseline: BaselineOrigin
  versions: FileVersion[]
  // Set when the size budget kept this file out of the store, carrying the reason.
  skipped?: string
}

export interface ConversationVersions {
  key: string
  turns: number
  bytes: number
  files: FileVersions[]
  capped?: boolean
}

export type VersionContent =
  | { path: string; turn: number; found: true; content: string }
  | { path: string; turn: number; found: false; reason: DiffGap }

export type DiffTarget = number | "head" | "next"

export type DiffGap = "unknown-baseline" | "missing-content" | "unresolved-target" | "store-failed" | "skipped"

export type FileDiff =
  | { path: string; from: number; to: DiffTarget; computed: true; patch: string; added: number; removed: number }
  | { path: string; from: number; to: DiffTarget; computed: false; reason: DiffGap }

export interface RestoreResult {
  path: string
  turn: number
  restored: boolean
  // Ask this, never `reason`: that is prose for a person and free to be reworded.
  forceable: boolean
  reason?: string
}
