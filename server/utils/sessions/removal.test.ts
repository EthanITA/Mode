import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { afterEach, beforeEach, test } from "node:test"
import { removeSession } from "./removal.ts"

const KEY = "ffff0001"
const ID = "ffff0001-1111-2222-3333-444444444444"

let root: string
let had: boolean
let was: string | undefined

function put(path: string, body: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, body)
}

function survivors(): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
}

function seed(key: string, id: string): void {
  put(join(root, "jobs", key, "state.json"), JSON.stringify({ sessionId: id, name: "throwaway", state: "done" }))
  put(join(root, "jobs", key, "timeline.jsonl"), "{}\n")
  put(join(root, "artifacts", `session-${key}`), "/tmp/a-document-other-sessions-share.md\n")
  put(join(root, "canvas", `session-${key}`), "{}")
  put(join(root, "tasks", `session-${key}`, "1.json"), "{}")
  put(join(root, "teams", `session-${key}`, "config.json"), "{}")
  put(join(root, "mode", "state", `session-${key}.mode`), "swarm\n")
  put(join(root, "mode", "state", `session-${key}.style`), "edu\n")
  put(join(root, "mode", "versions", key, "HEAD"), "ref\n")
  put(join(root, "projects", "-tmp", `${id}.jsonl`), '{"transcript":"stays"}\n')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "removal-"))
  had = "CLAUDE_CONFIG_DIR" in process.env
  was = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = root
  seed(KEY, ID)
  seed("ffff0002", "ffff0002-1111-2222-3333-444444444444")
})

afterEach(() => {
  if (had) process.env.CLAUDE_CONFIG_DIR = was ?? ""
  else delete process.env.CLAUDE_CONFIG_DIR
  rmSync(root, { recursive: true, force: true })
})

test("every place the session kept state goes, and the transcript and the neighbour stay", async () => {
  const outcome = await removeSession(KEY)
  assert.equal(outcome.refused, undefined)
  assert.equal(outcome.removed.length, 8)
  assert.deepEqual(survivors().filter((path) => path.includes(KEY)), [`projects/-tmp/${ID}.jsonl`])
  assert.equal(existsSync(join(root, "artifacts", "session-ffff0002")), true)
  assert.equal(existsSync(join(root, "jobs", "ffff0002", "state.json")), true)
})

test("a second delete removes nothing and does not fail", async () => {
  await removeSession(KEY)
  assert.deepEqual(await removeSession(KEY), { key: KEY, removed: [], killed: undefined })
})

test("a key that is not eight hex is refused before anything is touched", async () => {
  const outcome = await removeSession("../../etc")
  assert.equal(outcome.refused, "not a session key")
  assert.equal(existsSync(join(root, "jobs", KEY)), true)
})

// The key is a truncation of the uuid, so this is the collision that would delete a stranger.
test("a state file that does not key to its own directory is refused", async () => {
  put(join(root, "jobs", KEY, "state.json"), JSON.stringify({ sessionId: "99999999-1111-2222-3333-444444444444" }))
  const outcome = await removeSession(KEY)
  assert.match(outcome.refused ?? "", /does not key to this session/)
  assert.equal(existsSync(join(root, "artifacts", `session-${KEY}`)), true)
})

test("a job in worktree isolation is left to the CLI", async () => {
  put(join(root, "jobs", KEY, "state.json"), JSON.stringify({ sessionId: ID, bgIsolation: "worktree" }))
  const outcome = await removeSession(KEY)
  assert.match(outcome.refused ?? "", /isolation/)
  assert.equal(existsSync(join(root, "jobs", KEY)), true)
})
