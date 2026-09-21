import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useFixtures } from "./__fixtures__/env.ts"
import { sessions } from "./sessions.ts"

let restore: () => void
afterEach(() => restore?.())

test("lists every session id found under state/, each with its two slots and pipeline", () => {
  restore = useFixtures()
  const rows = sessions()
  assert.deepEqual(
    rows.map((r) => r.id),
    ["12121212", "34343434", "aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd"],
  )
  const gated = rows.find((r) => r.id === "aaaaaaaa")
  assert.equal(gated?.slots.mode.name, "gated")
  assert.equal(gated?.pipeline?.current, "dispatch")
  const auto = rows.find((r) => r.id === "bbbbbbbb")
  assert.deepEqual(auto?.slots.mode, { how: "auto" })
  assert.equal(auto?.pipeline, undefined)
})

test("a lone session in a separate config root reads its own state, pipeline included", () => {
  restore = useFixtures("config-disarmed")
  const rows = sessions()
  assert.deepEqual(rows.map((r) => r.id), ["56565656"])
  assert.equal(rows[0]?.slots.mode.name, "gated")
  assert.deepEqual(rows[0]?.slots.style, { how: "auto" })
  assert.equal(rows[0]?.pipeline?.current, "intake")
})
