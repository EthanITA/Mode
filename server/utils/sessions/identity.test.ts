import assert from "node:assert/strict"
import { test } from "node:test"
import { IDENTITY_COLORS, sessionColor } from "./identity.ts"

test("the same key always answers the same colour", () => {
  assert.equal(sessionColor("1b9d2d44"), sessionColor("1b9d2d44"))
  assert.equal(sessionColor("aaaaaaaa"), sessionColor("aaaaaaaa"))
})

test("every colour is one the client's tint table can resolve", () => {
  const keys = ["1b9d2d44", "4291935f", "c8203127", "aaaaaaaa", "bbbbbbbb", "00000000", ""]
  for (const key of keys) assert.ok(IDENTITY_COLORS.includes(sessionColor(key) as never))
})

test("neighbouring keys do not all land on one colour", () => {
  const keys = ["1b9d2d44", "4291935f", "c8203127", "1999d1d6", "310a2509", "ac912d7c", "5612abf2"]
  const spread = new Set(keys.map(sessionColor))
  assert.ok(spread.size > 2, `expected a spread across the palette, got ${[...spread].join(", ")}`)
})
