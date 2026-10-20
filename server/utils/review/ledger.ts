import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReviewFile, ReviewSnapshot } from "../../../shared/types/review.ts";
import { readTextSafe } from "../../../lib/files.ts";
import { configRoot, sidecarHome } from "../../../lib/mode/paths.ts";
import { Lines } from "../../../shared/utils/lines.ts";
import { hashOf } from "../sessions/files.ts";

// The sidecar mod's own limit: past it, or holding a NUL byte, a file is not reviewable.
const MAX_BYTES = 4 * 1024 * 1024;

interface Tracked {
  turns: number[];
  blob?: string;
}

interface Step {
  label: string;
}

export type ReviewOriginal = { kind: "blob"; file: string } | { kind: "created" } | { kind: "untracked" };

interface Ledger {
  turn: number;
  files: Record<string, Tracked>;
  undo: Step[];
  redo: Step[];
}

export function reviewHome(): string {
  return join(sidecarHome(), "review");
}

// A session whose mod loaded before the move keeps writing here until it restarts.
export function legacyReviewHome(): string {
  return join(configRoot(), "turn-diff");
}

// One folder per session, named by the full session id.
export function ledgerDirOf(key: string): string | undefined {
  for (const home of [reviewHome(), legacyReviewHome()]) {
    try {
      const name = readdirSync(home).find((one) => one.startsWith(key));
      if (name) return join(home, name);
    } catch {
      continue;
    }
  }
  return undefined;
}

function isHidden({ path, withJobs }: { path: string; withJobs: boolean }): boolean {
  const parts = path.split("/");
  const at = parts.indexOf(".claude");
  return at >= 0 && !(withJobs && parts[at + 1] === "jobs");
}

// Wrapped so an empty file stays distinct from a missing one.
function readReviewable(path: string): { text: string } | undefined {
  try {
    if (statSync(path).size > MAX_BYTES) return undefined;
  } catch {
    return undefined;
  }
  const text = readTextSafe(path) ?? "";
  return text.includes("\u0000") ? undefined : { text };
}

function ledgerOf(dir: string): Ledger | undefined {
  const raw = readTextSafe(join(dir, "review.json"));
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<Ledger>;
    return { turn: parsed.turn ?? 0, files: parsed.files ?? {}, undo: parsed.undo ?? [], redo: parsed.redo ?? [] };
  } catch {
    return undefined;
  }
}

function fileOf(dir: string, path: string, tracked: Tracked): ReviewFile | undefined {
  const before = tracked.blob ? readReviewable(join(dir, "blobs", tracked.blob)) : { text: "" };
  if (!before) return undefined;
  const after = readReviewable(path);
  const original = Lines.split(before.text);
  const current = Lines.split(after?.text ?? "");
  return {
    path,
    turns: tracked.turns,
    original,
    current,
    changes: Lines.changes(original, current),
    ...(tracked.blob ? { blob: tracked.blob } : { isNew: true as const }),
    ...(after ? { hash: hashOf(after.text) } : { isDeleted: true as const }),
  };
}

// Where a reviewed file's original is kept; a file the review does not track has none, and one it saw created never had one.
export function originalOf({ key, path }: { key: string; path: string }): ReviewOriginal {
  const dir = ledgerDirOf(key);
  const tracked = dir ? ledgerOf(dir)?.files[path] : undefined;
  if (!dir || !tracked) return { kind: "untracked" };
  return tracked.blob ? { kind: "blob", file: join(dir, "blobs", tracked.blob) } : { kind: "created" };
}

export function snapshotOf({
  key,
  live,
  withJobs = false,
}: {
  key: string;
  live: boolean;
  withJobs?: boolean;
}): ReviewSnapshot {
  const dir = ledgerDirOf(key);
  const ledger = dir ? ledgerOf(dir) : undefined;
  if (!dir || !ledger) return { key, live, turn: 0, files: [] };
  const files = Object.entries(ledger.files)
    .filter(([path]) => !isHidden({ path, withJobs }))
    .map(([path, tracked]) => fileOf(dir, path, tracked))
    .filter((file): file is ReviewFile => !!file && file.changes.length > 0);
  const undo = ledger.undo.at(-1)?.label;
  const redo = ledger.redo.at(-1)?.label;
  return { key, live, turn: ledger.turn, files, ...(undo && { undo }), ...(redo && { redo }) };
}
