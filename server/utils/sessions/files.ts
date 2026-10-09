import { createHash } from "node:crypto"
import { statSync, writeFileSync } from "node:fs"
import type { FileAction, FileContent, FileSave, SessionFile, SessionFiles } from "../../../shared/types/files.ts"
import { readTextSafe } from "../mode/fsutil.ts"
import { cwdOf, isInside } from "../tree/index.ts"
import { turnsOf } from "./receipts.ts"

const MAX_BYTES = 4 * 1024 * 1024

// A change outranks a read in the same turn, so the dot says what mattered last.
const WEIGHT: Record<FileAction, number> = { read: 0, edit: 1, delete: 2 }

function mark(row: SessionFile, turn: number, action: FileAction): void {
  if (turn > row.lastTurn || (turn === row.lastTurn && WEIGHT[action] > WEIGHT[row.lastAction])) {
    row.lastTurn = turn
    row.lastAction = action
  }
}

export function filesOf({ key }: { key: string }): SessionFiles {
  const rows = new Map<string, SessionFile>()
  const rowOf = (path: string): SessionFile => {
    const known = rows.get(path)
    if (known) return known
    const row: SessionFile = { path, group: "interacted", reads: 0, edits: 0, lastTurn: 0, lastAction: "read" }
    rows.set(path, row)
    return row
  }
  for (const { receipt, touches } of turnsOf({ key }).turns) {
    for (const path of receipt.read) {
      const row = rowOf(path)
      row.reads++
      mark(row, receipt.turn, "read")
    }
    for (const touch of touches) {
      const row = rowOf(touch.path)
      if (touch.created) row.group = "produced"
      if (touch.kind !== "delete") row.edits++
      mark(row, receipt.turn, touch.kind === "delete" ? "delete" : "edit")
    }
  }
  const files = [...rows.values()].sort((a, b) => b.lastTurn - a.lastTurn || a.path.localeCompare(b.path))
  return { key, files }
}

function hashOf(text: string): string {
  return createHash("sha1").update(text).digest("hex")
}

// What the conversation touched or what sits under its working directory, never an arbitrary file.
function isReachable({ key, path }: { key: string; path: string }): boolean {
  const root = cwdOf(key)
  return (!!root && isInside(root, path)) || filesOf({ key }).files.some((file) => file.path === path)
}

function read(path: string): FileContent {
  let size: number
  try {
    size = statSync(path).size
  } catch {
    return { path, reason: "missing" }
  }
  if (size > MAX_BYTES) return { path, reason: "too-large" }
  const text = readTextSafe(path) ?? ""
  return text.includes("\u0000") ? { path, reason: "binary" } : { path, text, hash: hashOf(text) }
}

export function contentOf({ key, path }: { key: string; path: string }): FileContent {
  return isReachable({ key, path }) ? read(path) : { path, reason: "not-touched" }
}

// Only over the text the editor opened, so a turn that changed the file in the meantime is never clobbered.
export function writeOver({ path, text, base }: { path: string; text: string; base: string }): FileSave {
  const now = read(path)
  if (!("text" in now)) return { saved: false, reason: now.reason }
  if (now.hash !== base) return { saved: false, reason: "changed-on-disk" }
  writeFileSync(path, text)
  return { saved: true, hash: hashOf(text) }
}

export function saveContent({ key, path, text, base }: { key: string; path: string; text: string; base: string }): FileSave {
  return isReachable({ key, path }) ? writeOver({ path, text, base }) : { saved: false, reason: "not-touched" }
}
