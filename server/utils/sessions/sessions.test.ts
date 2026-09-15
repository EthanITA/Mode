import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { ALPHA_ID, BETA_ID, useFixtures } from "./__fixtures__/env.ts"
import { liveSessions } from "./index.ts"
import type { LiveSession } from "../../../shared/types/session.ts"

let restore: () => void

before(() => {
  restore = useFixtures()
})

after(() => restore())

function find(all: LiveSession[], key: string): LiveSession {
  const one = all.find((session) => session.key === key)
  assert.ok(one, `expected a session keyed ${key}`)
  return one
}

test("a session keyed by its artifact list is skipped when nothing on disk can identify it", () => {
  const all = liveSessions()
  assert.deepEqual(
    all.map((session) => session.key),
    ["aaaaaaaa", "cccccccc", "bbbbbbbb"],
  )
})

test("a job identifies a session its artifact list alone could not, and supplies the name and cwd", () => {
  const gamma = find(liveSessions(), "cccccccc")
  assert.equal(gamma.name, "Gamma, as the job knows it")
  assert.equal(gamma.cwd, "/tmp/gamma")
  assert.equal(gamma.lane?.name, "working")
  assert.equal(gamma.archived, undefined)
})

// The CLI derives the lane, so a lane read off the file has to say so rather than pass for the CLI's.
test("a lane read from disk is marked derived", () => {
  assert.equal(find(liveSessions(), "cccccccc").lane?.derived, true)
})

test("a session no job owns is archived, and a job directory with no state file is no session", () => {
  const all = liveSessions()
  assert.equal(find(all, "aaaaaaaa").archived, true)
  assert.equal(find(all, "bbbbbbbb").archived, true)
  assert.equal(all.some((session) => session.key === "eeeeeeee"), false)
})

test("a live process supplies the id, the name and the cwd, and outranks the transcript", () => {
  const alpha = find(liveSessions(), "aaaaaaaa")
  assert.equal(alpha.id, ALPHA_ID)
  assert.equal(alpha.live, true)
  assert.equal(alpha.name, "Alpha, as the process knows it")
  assert.equal(alpha.cwd, "/tmp/alpha-moved")
  assert.equal(alpha.status, "busy")
})

test("a dead pid's registry file is not a live session, and its name falls to the transcript", () => {
  const beta = find(liveSessions(), "bbbbbbbb")
  assert.equal(beta.live, false)
  assert.equal(beta.id, BETA_ID)
  assert.notEqual(beta.name, "Beta, from a process that died")
})

test("a title that is only the session key is not a name, so the next candidate wins", () => {
  assert.equal(find(liveSessions(), "bbbbbbbb").name, "Beta, auto but real")
})

test("the session colour is its own, so switching mode cannot recolour the tab", () => {
  const all = liveSessions()
  const alpha = find(all, "aaaaaaaa")
  assert.equal(alpha.slots.mode.name, "demo")
  assert.equal(alpha.slots.mode.color, "blue")
  assert.equal(alpha.color, "magenta")
  // Holding no mode at all and still being coloured is the proof the two are unrelated.
  assert.equal(find(all, "bbbbbbbb").color, "cyan")
  assert.equal(find(all, "bbbbbbbb").slots.mode.color, undefined)
})

test("artifacts arrive newest first, blank lines dropped, a re-stamped slug keeping its later place", () => {
  const all = liveSessions()
  assert.deepEqual(find(all, "aaaaaaaa").artifacts, ["alpha-one", "alpha-three", "alpha-two"])
  assert.deepEqual(find(all, "bbbbbbbb").artifacts, [])
})

test("agents come from the subagent metas, colourless members left out", () => {
  assert.deepEqual(find(liveSessions(), "aaaaaaaa").agents, [
    { name: "One", color: "blue" },
    { name: "Two", color: "green" },
  ])
})

test("a session with no subagents folder falls back to the team roster", () => {
  assert.deepEqual(find(liveSessions(), "bbbbbbbb").agents, [{ name: "Three", color: "cyan" }])
})

test("live sessions sort ahead of the rest", () => {
  const all = liveSessions()
  assert.equal(all[0]?.live, true)
  assert.equal(all[1]?.live, false)
})

test("a transcript with no cwd record of its own reads the folder name back into a path", () => {
  assert.equal(find(liveSessions(), "bbbbbbbb").cwd, "/tmp/beta")
})

test("the transcript still supplies what the registry has no field for", () => {
  assert.equal(find(liveSessions(), "aaaaaaaa").gitBranch, "main")
})
