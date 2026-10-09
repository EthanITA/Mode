import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { Lines } from "../../../shared/utils/lines.ts"
import { snapshotOf } from "./ledger.ts"

const ID = "0a1b2c3d-0000-4000-8000-000000000000"
let root = ""

before(() => {
  root = mkdtempSync(join(tmpdir(), "review-"))
  process.env.CLAUDE_CONFIG_DIR = root
  const dir = join(root, "turn-diff", ID)
  mkdirSync(join(dir, "blobs"), { recursive: true })
  writeFileSync(join(dir, "blobs", "orig"), "one\ntwo\n")
  writeFileSync(join(dir, "blobs", "same"), "kept\n")
  writeFileSync(join(root, "edited"), "one\nTWO\nthree\n")
  writeFileSync(join(root, "created"), "fresh\n")
  writeFileSync(join(root, "settled"), "kept\n")
  const files = {
    [join(root, "edited")]: { turns: [1, 2], blob: "orig" },
    [join(root, "created")]: { turns: [2] },
    [join(root, "settled")]: { turns: [1], blob: "same" },
    [join(root, "gone")]: { turns: [2], blob: "orig" },
  }
  const undo = [{ label: "approving a" }, { label: "rejecting line 2 of edited" }]
  writeFileSync(join(dir, "review.json"), JSON.stringify({ turn: 2, files, undo, redo: [] }))
})

after(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
})

test("the snapshot pairs each file's original blob with the disk, and leaves out what already matches", () => {
  const snapshot = snapshotOf({ key: ID.slice(0, 8), live: true })
  const byName = new Map(snapshot.files.map((file) => [file.path.slice(root.length + 1), file]))
  assert.deepEqual([...byName.keys()].sort(), ["created", "edited", "gone"])
  assert.deepEqual(byName.get("edited")?.changes, [{ oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 3 }])
  assert.equal(byName.get("created")?.isNew, true)
  assert.equal(byName.get("gone")?.isDeleted, true)
  assert.equal(snapshot.turn, 2)
  assert.equal(snapshot.undo, "rejecting line 2 of edited")
  assert.equal(snapshot.redo, undefined)
})

test("an unknown key reads as an empty review", () => {
  assert.deepEqual(snapshotOf({ key: "ffffffff", live: false }), { key: "ffffffff", live: false, turn: 0, files: [] })
})

test("the diff keeps a replaced line and an added one in one change", () => {
  assert.deepEqual(Lines.changes(["a", "b", "c"], ["a", "B", "c", "d"]), [
    { oldStart: 1, oldEnd: 2, newStart: 1, newEnd: 2 },
    { oldStart: 3, oldEnd: 3, newStart: 3, newEnd: 4 },
  ])
})
