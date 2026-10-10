export interface ReviewFile {
  path: string;
  turns: number[];
  original: string[];
  current: string[];
  changes: ReviewChange[];
  isNew?: true;
  isDeleted?: true;
}

// Half-open, 0-based line ranges: `oldStart..oldEnd` in the original became `newStart..newEnd` on disk.
export interface ReviewChange {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

export interface ReviewSnapshot {
  key: string;
  live: boolean;
  turn: number;
  files: ReviewFile[];
  /** What ⌘Z would take back, or ⌘⇧Z apply again, in the mod's words: "rejecting line 2 of a.ts". */
  redo?: string;
  undo?: string;
}

// Mirrors the sidecar mod's ReviewAction, which runs it; line numbers are 1-based, as a person reads them.
export type ReviewAction =
  | { do: "approve" | "reject"; paths: string[] }
  | { do: "accept-lines" | "reject-lines"; path: string; old: number[]; new: number[] }
  | { do: "undo" | "redo" };

export type ReviewActionReply =
  { delivered: true } | { delivered: false; reason: "bad-action" | "no-live-session" | "refused-by-inbox" };

// `claude` is an explicit `/sidecar`, `prompt` someone typing in that session's prompt, `terminal` Terminal's front tab switching.
export type FollowSource = "claude" | "prompt" | "terminal" | "none";

export interface FollowTarget {
  /** The face to show there, such as Review; the client ignores one it does not know. */
  face?: string;
  key?: string;
  name?: string;
  /** An artifact to open there, which always shows in Files. */
  slug?: string;
  source: FollowSource;
}

export interface FollowReply {
  listeners: number;
}
