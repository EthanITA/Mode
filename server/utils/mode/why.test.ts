import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useFixtures } from "./__fixtures__/env.ts"
import { resolveDir } from "./paths.ts"
import { why } from "./why.ts"

let restore: () => void
afterEach(() => restore?.())

const WAITING_ALL = [
  { name: "base" },
  { name: "empty", until: "nevermatches" },
  { name: "scoped", until: "alpha | beta | gamma and 1 more" },
]

test("a typed session mid-pipeline: direct labels and events both advance, one gate blocks the rest", () => {
  restore = useFixtures()
  const result = why("aaaaaaaa")
  assert.equal(result.session, "aaaaaaaa")
  assert.deepEqual(result.slots.mode, {
    name: "gated",
    how: "typed",
    summary: "A gated pipeline mode, for exercising steps, loops and both gates.",
    color: "magenta",
  })
  assert.deepEqual(result.slots.style, {
    name: "plain",
    how: "typed",
    summary: "A plain style, for the simple cases.",
    color: "cyan",
  })
  assert.deepEqual(result.pipeline, {
    axis: "mode",
    steps: ["intake", "spec", "approval", "dispatch", "integrate", "deliver"],
    done: ["intake", "spec", "approval"],
    current: "dispatch",
    next: "integrate",
    complete: false,
  })
  assert.deepEqual(result.gates, [
    { name: "no-code-without-red", state: "shut", reason: "no red is standing, so an implementation edit is refused" },
    { name: "no-dispatch-without-approval", state: "open", reason: "widget-x is approved" },
  ])
  assert.deepEqual(result.rules, { told: ["base", "empty"], waiting: [{ name: "scoped", until: "alpha | beta | gamma and 1 more" }] })
})

test("auto slots hold no contract, so the gate reason names the empty mode by its literal value", () => {
  restore = useFixtures()
  const result = why("bbbbbbbb")
  assert.deepEqual(result.slots.mode, { how: "auto" })
  assert.deepEqual(result.slots.style, { how: "auto" })
  assert.equal(result.pipeline, undefined)
  assert.deepEqual(result.gates, [
    { name: "no-code-without-red", state: "open", reason: "not declared by auto" },
    { name: "no-dispatch-without-approval", state: "open", reason: "not declared by auto" },
  ])
  assert.deepEqual(result.rules, { told: [], waiting: WAITING_ALL })
})

test("a red standing opens the code gate and blocks the pipeline at step one", () => {
  restore = useFixtures()
  const result = why("cccccccc")
  assert.deepEqual(result.pipeline, {
    axis: "mode",
    steps: ["intake", "spec", "approval", "dispatch", "integrate", "deliver"],
    done: [],
    current: "intake",
    next: "spec",
    complete: false,
  })
  assert.deepEqual(result.gates, [
    { name: "no-code-without-red", state: "open", reason: "a red is standing" },
    { name: "no-dispatch-without-approval", state: "shut", reason: "nothing is approved under gated, so spawning a teammate is refused" },
  ])
})

test("a mode with no gate flags reports both gates open and not declared", () => {
  restore = useFixtures()
  const result = why("dddddddd")
  assert.equal(result.pipeline, undefined)
  assert.deepEqual(result.gates, [
    { name: "no-code-without-red", state: "open", reason: "not declared by demo" },
    { name: "no-dispatch-without-approval", state: "open", reason: "not declared by demo" },
  ])
})

test("guards off in config.json disarms only the switchable gate", () => {
  restore = useFixtures("config-disarmed")
  const result = why("56565656")
  assert.deepEqual(result.gates, [
    { name: "no-code-without-red", state: "open", reason: "declared but disarmed by guards: off in config.json" },
    { name: "no-dispatch-without-approval", state: "shut", reason: "nothing is approved under gated, so spawning a teammate is refused" },
  ])
  assert.equal(result.path, resolveDir())
})
