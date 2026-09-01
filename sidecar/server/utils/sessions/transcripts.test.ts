import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { ALPHA_ID, useFixtures } from "./__fixtures__/env.ts"
import { identityOf, transcriptIndex, type TranscriptRef } from "./transcripts.ts"

let restore: () => void

before(() => {
  restore = useFixtures()
})

after(() => restore())

function ref(key: string): TranscriptRef {
  const found = transcriptIndex().get(key)
  assert.ok(found, `expected a transcript keyed ${key}`)
  return found
}

test("the index keys every project folder's transcripts by the first 8 hex of the uuid", () => {
  assert.deepEqual([...transcriptIndex().keys()].sort(), ["aaaaaaaa", "bbbbbbbb"])
  assert.equal(ref("aaaaaaaa").id, ALPHA_ID)
  assert.equal(ref("aaaaaaaa").slug, "-tmp-alpha")
})

test("identity comes from the session's own record, never a sidechain's", () => {
  const identity = identityOf(ref("aaaaaaaa"))
  assert.equal(identity.cwd, "/tmp/alpha")
  assert.equal(identity.gitBranch, "main")
})

test("a line that is not json, and a last line cut mid-write, are skipped rather than thrown on", () => {
  assert.deepEqual(identityOf(ref("aaaaaaaa")).names, ["Alpha, named by hand", "auto guessed alpha"])
})

test("name candidates arrive best first: hand-typed, then agent name, then the guessed one", () => {
  assert.deepEqual(identityOf(ref("bbbbbbbb")).names, ["bbbbbbbb", "Beta, auto but real"])
})

test("a transcript unchanged since the last read is answered from the cache", () => {
  const first = identityOf(ref("aaaaaaaa"))
  assert.equal(identityOf(ref("aaaaaaaa")), first)
})
