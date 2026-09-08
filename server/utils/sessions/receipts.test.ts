import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, test } from "node:test"
import { DELTA_KEY, RECEIPTS_DIR, useReceiptFixtures } from "./__fixtures__/env.ts"
import { resolvePluginRoot } from "../mode/paths.ts"
import { applyEdit, receiptsOf, removedPaths, turnsOf } from "./receipts.ts"
import { invertEdit, planOf } from "./store.ts"

// Climbs to the folder holding .claude-plugin rather than counting "..": a hand-counted
// depth silently walked out of the repo when the app was hoisted to the root.
const BIN = join(resolvePluginRoot(dirname(fileURLToPath(import.meta.url)), ""), "bin", "versions.ts")

let restore: () => void

before(() => {
  restore = useReceiptFixtures()
})

after(() => restore())

const receipts = () => receiptsOf({ key: DELTA_KEY }).turns
const plan = () => planOf(turnsOf({ key: DELTA_KEY }).turns)

test("a turn is one real prompt: a slash command opens one, its own stdout does not", () => {
  assert.deepEqual(
    receipts().map((one) => one.prompt),
    ["make the new file", "now fix the old one", "/tidy everything", undefined],
  )
})

test("tool calls land in the four buckets, and a failed edit is not a write", () => {
  const [, second] = receipts()
  assert.deepEqual(second?.read, ["/tmp/delta/old.ts"])
  assert.deepEqual(second?.wrote, ["/tmp/delta/old.ts", "/tmp/delta/drifted.ts"])
  assert.deepEqual(second?.deleted, ["/tmp/delta/gone.ts"])
  assert.deepEqual(second?.ran.map((one) => one.command), ["rm -f gone.ts && echo done", "spawned Scribe"])
})

test("a subagent's write belongs to the turn it happened in, under the subagent's name", () => {
  const third = receipts()[2]
  assert.deepEqual(third?.by, ["Scribe"])
  assert.deepEqual(third?.wrote, ["/tmp/delta/new.ts"])
})

test("the turn that spawned an agent says so, so the agent does not appear from nowhere", () => {
  const [, second] = receipts()
  assert.ok(second?.ran.some((one) => one.command === "spawned Scribe"))
  assert.ok(second?.by?.includes("Scribe"))
})

test("work landing after the session went quiet gets an open turn, not a finished one", () => {
  const all = receipts()
  const open = all[all.length - 1]
  assert.equal(open?.prompt, undefined)
  assert.deepEqual(open?.by, ["Scribe"])
  assert.deepEqual(open?.wrote, ["/tmp/delta/late.ts"])
})

test("a file first touched after turn one is baselined with its prior content, so it reads as a change", () => {
  const { plans, baselines } = plan()
  assert.equal(baselines.get("/tmp/delta/old.ts"), "exact")
  assert.deepEqual(plans[1]?.baselines, [{ path: "/tmp/delta/old.ts", by: "", content: "one\ntwo\nthree\n" }])
  assert.equal(plans[1]?.files.find((one) => one.path === "/tmp/delta/old.ts")?.content, "one\nTWO\nthree\n")
})

test("a file the turn created carries no baseline, because it really was new", () => {
  const { plans, baselines } = plan()
  assert.equal(baselines.get("/tmp/delta/new.ts"), "absent")
  assert.deepEqual(plans[0]?.baselines, [])
  assert.equal(plans[2]?.files[0]?.content, "export const a = 2\n")
})

test("an edit with no recorded prior and nothing to walk back from is unknown, never empty", () => {
  const { baselines } = plan()
  assert.equal(baselines.get("/tmp/delta/drifted.ts"), "unknown")
})

test("git sees the late-touched file as modified rather than added", () => {
  const root = mkdtempSync(join(tmpdir(), "sidecar-versions-"))
  try {
    cpSync(RECEIPTS_DIR, root, { recursive: true })
    const run = (args: string[]): string =>
      execFileSync(process.execPath, ["--experimental-strip-types", BIN, ...args], {
        encoding: "utf8",
        env: { ...process.env, CLAUDE_CONFIG_DIR: root },
      })
    run(["build", DELTA_KEY])
    const diff = JSON.parse(run(["diff", DELTA_KEY, "--path", "/tmp/delta/old.ts", "--from", "1", "--to", "2"]))
    assert.equal(diff.computed, true)
    assert.match(diff.patch, /-two\n\+TWO/)
    assert.doesNotMatch(diff.patch, /new file mode/)

    // The gap D6 must not be able to draw as "nothing changed".
    const gap = JSON.parse(run(["diff", DELTA_KEY, "--path", "/tmp/delta/drifted.ts", "--from", "1", "--to", "2"]))
    assert.equal(gap.computed, false)
    assert.equal(gap.reason, "unknown-baseline")
    assert.equal("patch" in gap, false)

    // The property the union exists to guarantee: the two are not the same value.
    const unchanged = JSON.parse(run(["diff", DELTA_KEY, "--path", "/tmp/delta/old.ts", "--from", "2", "--to", "2"]))
    assert.equal(unchanged.computed, true)
    assert.equal(unchanged.patch, "")
    assert.notDeepEqual({ ...gap, path: "" }, { ...unchanged, path: "" })

    const listed = JSON.parse(run(["list", DELTA_KEY, "--path", "/tmp/delta/drifted.ts"]))
    assert.equal(listed.files[0].baseline, "unknown")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("an unknown baseline inside a git tree is reconstructed from the last tracked commit", () => {
  const root = mkdtempSync(join(tmpdir(), "sidecar-git-baseline-"))
  const repo = join(root, "repo")
  const config = join(root, "config")
  const target = join(repo, "tracked.ts")
  const key = "ffffffff"
  try {
    mkdirSync(repo, { recursive: true })
    mkdirSync(join(config, "projects", "-tmp-tracked"), { recursive: true })
    writeFileSync(target, "alpha\n")
    execFileSync("git", ["-C", repo, "init", "-q", "-b", "main"])
    execFileSync("git", ["-C", repo, "config", "user.name", "fixture"])
    execFileSync("git", ["-C", repo, "config", "user.email", "fixture@local"])
    execFileSync("git", ["-C", repo, "add", "tracked.ts"])
    execFileSync("git", ["-C", repo, "commit", "-q", "-m", "seed", "--author", "fixture <fixture@local>"], {
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-01-01T09:00:00.000Z", GIT_COMMITTER_DATE: "2026-01-01T09:00:00.000Z" },
    })
    writeFileSync(join(config, "projects", "-tmp-tracked", `${key}-1111-2222-3333-444444444444.jsonl`), editTranscript(target))
    const run = (args: string[]): string =>
      execFileSync(process.execPath, ["--experimental-strip-types", BIN, ...args], {
        encoding: "utf8",
        env: { ...process.env, CLAUDE_CONFIG_DIR: config },
      })
    run(["build", key])
    const listed = JSON.parse(run(["list", key, "--path", target]))
    assert.equal(listed.files[0].baseline, "reconstructed")
    const diff = JSON.parse(run(["diff", key, "--path", target, "--from", "1", "--to", "2"]))
    assert.equal(diff.computed, true)
    assert.match(diff.patch, /-alpha\n\+beta/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("restore refuses to clobber a file that moved on since the store's head", () => {
  const root = mkdtempSync(join(tmpdir(), "sidecar-restore-"))
  const target = join(root, "target.ts")
  const key = "eeeeeeee"
  try {
    mkdirSync(join(root, "projects", "-tmp-e"), { recursive: true })
    writeFileSync(join(root, "projects", "-tmp-e", `${key}-1111-2222-3333-444444444444.jsonl`), transcript(target))
    writeFileSync(target, "v1\n")
    const run = (args: string[]): string =>
      execFileSync(process.execPath, ["--experimental-strip-types", BIN, ...args], {
        encoding: "utf8",
        env: { ...process.env, CLAUDE_CONFIG_DIR: root },
      })

    writeFileSync(target, "somebody else was here\n")
    const refused = JSON.parse(run(["restore", key, "--path", target, "--turn", "1"]))
    assert.equal(refused.restored, false)
    // The field, never the sentence: the wording is prose and free to change.
    assert.equal(refused.forceable, true)
    assert.ok(refused.reason, "a refusal that explains nothing is its own bug")
    assert.equal(readFileSync(target, "utf8"), "somebody else was here\n")

    const hopeless = JSON.parse(run(["restore", key, "--path", join(root, "never-stored.ts"), "--turn", "1"]))
    assert.equal(hopeless.forceable, false)
    assert.ok(hopeless.reason)

    assert.equal(JSON.parse(run(["restore", key, "--path", target, "--turn", "1", "--force"])).restored, true)
    assert.equal(readFileSync(target, "utf8"), "v1\n")

    // Disk now sits on a stored version, so a second restore is not a clobber and needs no force.
    assert.equal(JSON.parse(run(["restore", key, "--path", target, "--turn", "1"])).restored, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function editTranscript(target: string): string {
  const cwd = dirname(target)
  return [
    { type: "user", cwd, timestamp: "2026-01-01T12:00:00.000Z", message: { role: "user", content: "look at it" } },
    { type: "user", cwd, timestamp: "2026-01-01T12:05:00.000Z", message: { role: "user", content: "now fix the old one" } },
    {
      type: "assistant",
      cwd,
      timestamp: "2026-01-01T12:05:10.000Z",
      message: { role: "assistant", content: [{ type: "tool_use", id: "e1", name: "Edit", input: { file_path: target, old_string: "alpha", new_string: "beta" } }] },
    },
    {
      type: "user",
      cwd,
      timestamp: "2026-01-01T12:05:11.000Z",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "e1", content: "ok" }] },
      toolUseResult: { filePath: target, oldString: "alpha", newString: "beta", originalFile: null, replaceAll: false, structuredPatch: [{ oldStart: 1 }] },
    },
  ]
    .map((one) => JSON.stringify(one))
    .join("\n")
}

function transcript(target: string): string {
  const write = { file_path: target, content: "v1\n" }
  return [
    { type: "user", cwd: "/tmp/e", timestamp: "2026-01-01T10:00:00.000Z", message: { role: "user", content: "write it" } },
    {
      type: "assistant",
      cwd: "/tmp/e",
      timestamp: "2026-01-01T10:00:01.000Z",
      message: { role: "assistant", content: [{ type: "tool_use", id: "w1", name: "Write", input: write }] },
    },
    {
      type: "user",
      cwd: "/tmp/e",
      timestamp: "2026-01-01T10:00:02.000Z",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "w1", content: "ok" }] },
      toolUseResult: { type: "create", filePath: target, content: "v1\n", originalFile: null, structuredPatch: [] },
    },
  ]
    .map((one) => JSON.stringify(one))
    .join("\n")
}

test("an inversion needs a locatable anchor, and refuses a replaceAll it cannot place", () => {
  assert.equal(invertEdit("one\nTWO\nthree", { old: "two", new: "TWO" }), "one\ntwo\nthree")
  assert.equal(invertEdit("nothing here", { old: "two", new: "TWO" }), undefined)
  // A deletion edit leaves no anchor to seek, so where the text was is unknowable.
  assert.equal(invertEdit("one\nthree", { old: "two\n", new: "" }), undefined)
  assert.equal(invertEdit("b once", { old: "a", new: "b", all: true }), "a once")
  assert.equal(invertEdit("b and b", { old: "a", new: "b", all: true }), undefined)
})

test("an edit whose replacement holds a dollar sign is not read as a capture group", () => {
  assert.equal(applyEdit("cost is X", { old: "X", new: "$& $1" }), "cost is $& $1")
  assert.equal(applyEdit("a a a", { old: "a", new: "b", all: true }), "b b b")
  assert.equal(applyEdit("nothing here", { old: "absent", new: "x" }), undefined)
})

test("only a literal rm counts as a deletion, and a quoted path stays whole", () => {
  assert.deepEqual(removedPaths('rm -rf "/tmp/a b/c.ts"', "/tmp"), ["/tmp/a b/c.ts"])
  assert.deepEqual(removedPaths("git rm old.ts", "/tmp/delta"), ["/tmp/delta/old.ts"])
  assert.deepEqual(removedPaths("rm *.log", "/tmp"), [])
  assert.deepEqual(removedPaths("find . -name '*.tmp' -delete", "/tmp"), [])
})
