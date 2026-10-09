export type FileAction = "read" | "edit" | "delete"

// Produced: Claude created the file in this conversation. Interacted: it read or changed one that existed.
export type FileGroup = "produced" | "interacted"

export interface SessionFile {
  path: string
  group: FileGroup
  reads: number
  edits: number
  lastTurn: number
  lastAction: FileAction
}

export interface SessionFiles {
  key: string
  files: SessionFile[]
}

export type FileContent =
  | { path: string; text: string }
  | { path: string; reason: "not-touched" | "missing" | "too-large" | "binary" }
