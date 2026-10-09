import type { FileAction, SessionFile, SessionFiles } from "../../../shared/types/files.ts"
import { turnsOf } from "./receipts.ts"

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
