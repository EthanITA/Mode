import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useFixtures } from "./__fixtures__/env.ts"
import { approvedSlug, declared, guardsArmed, held, ledger, redStanding, sourceOf } from "./state.ts"

let restore: () => void
afterEach(() => restore?.())

test("held reads the slot, sourceOf tells typed from chosen from pinned", () => {
  restore = useFixtures()
  assert.equal(held("mode", "aaaaaaaa"), "gated")
  assert.equal(sourceOf("mode", "aaaaaaaa"), undefined)
  assert.equal(sourceOf("mode", "12121212"), "chosen")
  assert.equal(sourceOf("mode", "34343434"), "pinned")
  assert.equal(held("mode", "unknownsession"), "")
})

test("ledger keeps only entries stamped under the currently held contract, lowercased", () => {
  restore = useFixtures()
  assert.deepEqual(declared("mode", "aaaaaaaa"), new Set(["intake", "artifact", "approve"]))
  assert.deepEqual(ledger("style", "aaaaaaaa"), [])
})

test("redStanding reads the last red/green entry, approvedSlug reads the stamped slug", () => {
  restore = useFixtures()
  assert.equal(redStanding("cccccccc"), true)
  assert.equal(redStanding("aaaaaaaa"), false)
  assert.equal(approvedSlug("aaaaaaaa"), "widget-x")
  assert.equal(approvedSlug("cccccccc"), "")
})

test("guardsArmed reads config.json, defaults true when it's missing or silent", () => {
  restore = useFixtures("config")
  assert.equal(guardsArmed(), true)
  restore()
  restore = useFixtures("config-disarmed")
  assert.equal(guardsArmed(), false)
})
