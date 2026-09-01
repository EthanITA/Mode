import assert from "node:assert/strict"
import { join } from "node:path"
import { test } from "node:test"
import { FIXTURES_DIR } from "./__fixtures__/env.ts"
import { cwdFromSlug } from "./slug.ts"

function slugify(path: string): string {
  return path.replace(/[/.]/g, "-")
}

test("a leading dot came through as a doubled dash and goes back to a dot", () => {
  assert.equal(cwdFromSlug("-Users-someone--claude-jobs-ab12cd34-tmp"), "/Users/someone/.claude/jobs/ab12cd34/tmp")
})

test("nothing on disk to check against still yields the plain expansion", () => {
  assert.equal(cwdFromSlug("-tmp-beta"), "/tmp/beta")
})

test("a folder whose own name holds a dash is recovered by asking the filesystem", () => {
  const real = join(FIXTURES_DIR, "tree", "dash-in-name", "leaf")
  assert.equal(cwdFromSlug(slugify(real)), real)
})

test("this file's own directory survives the round trip", () => {
  assert.equal(cwdFromSlug(slugify(FIXTURES_DIR)), FIXTURES_DIR)
})
