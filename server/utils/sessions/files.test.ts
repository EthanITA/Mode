import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { writeOver } from "./files.ts"

const sha1 = (text: string): string => createHash("sha1").update(text).digest("hex")

test("a save lands over the text it opened, and a stale base never clobbers a newer file", () => {
  const dir = mkdtempSync(join(tmpdir(), "files-"))
  const path = join(dir, "a.ts")
  try {
    writeFileSync(path, "one\n")
    assert.deepEqual(writeOver({ path, text: "two\n", base: sha1("one\n") }), { saved: true, hash: sha1("two\n") })
    assert.equal(readFileSync(path, "utf8"), "two\n")
    assert.deepEqual(writeOver({ path, text: "three\n", base: sha1("one\n") }), { saved: false, reason: "changed-on-disk" })
    assert.equal(readFileSync(path, "utf8"), "two\n")
    assert.deepEqual(writeOver({ path: join(dir, "gone.ts"), text: "x", base: sha1("") }), { saved: false, reason: "missing" })
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
})
