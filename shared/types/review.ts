export interface ReviewFile {
  path: string
  turns: number[]
  original: string[]
  current: string[]
  changes: ReviewChange[]
  isNew?: true
  isDeleted?: true
}

// Half-open, 0-based line ranges: `oldStart..oldEnd` in the original became `newStart..newEnd` on disk.
export interface ReviewChange {
  oldStart: number
  oldEnd: number
  newStart: number
  newEnd: number
}

export interface ReviewSnapshot {
  key: string
  live: boolean
  turn: number
  files: ReviewFile[]
}

// Mirrors the turn-diff mod's TurnDiffAction, which runs it; line numbers are 1-based, as a person reads them.
export type ReviewAction =
  | { do: "approve" | "reject"; paths: string[] }
  | { do: "accept-lines" | "reject-lines"; path: string; old: number[]; new: number[] }

export type ReviewActionReply =
  | { delivered: true }
  | { delivered: false; reason: "bad-action" | "no-live-session" | "refused-by-inbox" }

export interface FollowTarget {
  key?: string
  name?: string
  source: "terminal" | "prompt" | "none"
}
