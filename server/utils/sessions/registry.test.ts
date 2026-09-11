import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { ALPHA_ID, useFixtures } from "./__fixtures__/env.ts"
import { isAlive, liveEntries } from "./registry.ts"

let restore: () => void

before(() => {
  restore = useFixtures()
})

after(() => restore())

test("this very process is alive and a pid past the system maximum is not", () => {
  assert.equal(isAlive(process.pid), true)
  assert.equal(isAlive(999999999), false)
  assert.equal(isAlive(0), false)
  assert.equal(isAlive(-1), false)
})

test("only registry files whose process is still running count, and only those with a session id", () => {
  const entries = liveEntries()
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [ALPHA_ID],
  )
  assert.equal(entries[0]?.name, "Alpha, as the process knows it")
  assert.equal(entries[0]?.status, "busy")
})
