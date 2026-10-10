export type FileAction = "read" | "edit" | "delete";

// Produced: Claude created the file in this conversation. Interacted: it read or changed one that existed.
export type FileGroup = "produced" | "interacted";

export interface SessionFile {
  path: string;
  group: FileGroup;
  reads: number;
  edits: number;
  lastTurn: number;
  lastAction: FileAction;
}

export interface SessionFiles {
  key: string;
  files: SessionFile[];
}

export type FileUnshown = "not-touched" | "missing" | "too-large" | "binary";

// `hash` is what a save names as its base, so a write never lands over text the editor did not open.
export type FileContent = { path: string; text: string; hash: string } | { path: string; reason: FileUnshown };

export type FileSave = { saved: true; hash: string } | { saved: false; reason: FileUnshown | "changed-on-disk" };
