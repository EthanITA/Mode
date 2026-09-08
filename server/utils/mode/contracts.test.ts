import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { useFixtures } from "./__fixtures__/env.ts"
import { alternatives, names, pipelineLoops, pipelineSteps, truthy } from "./contracts.ts"

let restore: () => void
afterEach(() => restore?.())

test("names lists the fixture contracts, sorted", () => {
  restore = useFixtures()
  assert.deepEqual(names("mode"), ["demo", "gated"])
  assert.deepEqual(names("style"), ["plain"])
})

test("pipelineSteps parses the gate marker and the @event off each step", () => {
  restore = useFixtures()
  assert.deepEqual(pipelineSteps("mode", "gated"), [
    { label: "intake", gate: false, event: "" },
    { label: "spec", gate: false, event: "artifact" },
    { label: "approval", gate: true, event: "approve" },
    { label: "dispatch", gate: false, event: "agent" },
    { label: "integrate", gate: false, event: "" },
    { label: "deliver", gate: false, event: "commit" },
  ])
  assert.deepEqual(pipelineSteps("mode", "demo"), [])
})

test("pipelineLoops drops an arc naming a step that no longer exists", () => {
  restore = useFixtures()
  const steps = pipelineSteps("mode", "gated")
  assert.deepEqual(pipelineLoops("mode", "gated", steps), [
    { from: "approval", to: "spec" },
    { from: "integrate", to: "dispatch" },
    { from: "deliver", to: "intake" },
  ])
})

test("truthy and alternatives read front matter the way bin/mode does", () => {
  restore = useFixtures()
  assert.equal(truthy({ flag: "true" }, "flag"), true)
  assert.equal(truthy({ flag: "off" }, "flag"), false)
  assert.equal(truthy({}, "flag"), false)
  assert.deepEqual(alternatives({ when: "alpha|Beta| gamma " }, "when"), ["alpha", "beta", "gamma"])
})
