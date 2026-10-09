import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import type { ReviewFile, ReviewSnapshot } from "../../../shared/types/review.ts"
import { readTextSafe } from "../mode/fsutil.ts"
import { configRoot } from "../mode/paths.ts"
import { changesOf } from "./diff.ts"

// The turn-diff mod's own limit: past it, or holding a NUL byte, a file is not reviewable.
const MAX_BYTES = 4 * 1024 * 1024

interface Tracked {
  turns: number[]
  blob?: string
}

interface Ledger {
  turn: number
  files: Record<string, Tracked>
}

// The turn-diff mod writes one folder per session, named by the full session id.
export function reviewHome(): string {
  return join(configRoot(), "turn-diff")
}

export function ledgerDirOf(key: string): string | undefined {
  try {
    const name = readdirSync(reviewHome()).find((one) => one.startsWith(key))
    return name && join(reviewHome(), name)
  } catch {
    return undefined
  }
}

function linesOf(text: string): string[] {
  if (!text) return []
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")
}

// Wrapped so an empty file stays distinct from a missing one.
function readReviewable(path: string): { text: string } | undefined {
  try {
    if (statSync(path).size > MAX_BYTES) return undefined
  } catch {
    return undefined
  }
  const text = readTextSafe(path) ?? ""
  return text.includes("\u0000") ? undefined : { text }
}

function ledgerOf(dir: string): Ledger | undefined {
  const raw = readTextSafe(join(dir, "review.json"))
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Partial<Ledger>
    return { turn: parsed.turn ?? 0, files: parsed.files ?? {} }
  } catch {
    return undefined
  }
}

function fileOf(dir: string, path: string, tracked: Tracked): ReviewFile | undefined {
  const before = tracked.blob ? readReviewable(join(dir, "blobs", tracked.blob)) : { text: "" }
  if (!before) return undefined
  const after = readReviewable(path)
  const original = linesOf(before.text)
  const current = linesOf(after?.text ?? "")
  return {
    path,
    turns: tracked.turns,
    original,
    current,
    changes: changesOf(original, current),
    ...(tracked.blob ? {} : { isNew: true as const }),
    ...(after ? {} : { isDeleted: true as const }),
  }
}

export function snapshotOf({ key, live }: { key: string; live: boolean }): ReviewSnapshot {
  const dir = ledgerDirOf(key)
  const ledger = dir ? ledgerOf(dir) : undefined
  if (!dir || !ledger) return { key, live, turn: 0, files: [] }
  const files = Object.entries(ledger.files)
    .map(([path, tracked]) => fileOf(dir, path, tracked))
    .filter((file): file is ReviewFile => !!file && file.changes.length > 0)
  return { key, live, turn: ledger.turn, files }
}
