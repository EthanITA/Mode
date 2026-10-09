import assert from "node:assert/strict"
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, test } from "node:test"
import { denial, env, fire, MODE, run, scratch, silent, transcript, used, type Line } from "./support.ts"

const tmp = scratch("mode-git-")

function git(repo: string, ...args: string[]): void {
  const done = run("git", ["-C", repo, ...args])
  assert.equal(done.status, 0, done.stderr)
}

function repository(): string {
  const repo = mkdtempSync(join(tmp, "repo-"))
  git(repo, "init", "-q", "-b", "main")
  git(repo, "config", "user.email", "t@example.com")
  git(repo, "config", "user.name", "t")
  for (const name of ["theirs.txt", "mine.txt"]) writeFileSync(join(repo, name), "committed\n")
  git(repo, "add", ".")
  git(repo, "commit", "-q", "-m", "init")
  return repo
}

const vars = (config = mkdtempSync(join(tmp, "config-"))) => env({ CLAUDE_CONFIG_DIR: config })

describe("git-guard, against someone else's uncommitted edits", () => {
  const repo = repository()
  appendFileSync(join(repo, "theirs.txt"), "uncommitted\n")
  appendFileSync(join(repo, "mine.txt"), "uncommitted\n")
  const mine = transcript(tmp, [used("Edit", { file_path: join(repo, "mine.txt") })])
  const bash = (command: string, cwd: string) =>
    fire("guards/git-guard", { hook_event_name: "PreToolUse", tool_name: "Bash", cwd, transcript_path: mine, tool_input: { command } }, vars())

  test("a switch that would carry someone else's edit is denied, naming only their file", () => {
    const why = denial(bash("git switch -c other", repo)) ?? ""
    assert.ok(why.includes("theirs.txt") && !why.includes("mine.txt"), why)
  })

  test("reset --hard is denied too, with the repo found through cd", () => {
    assert.ok(denial(bash(`cd ${repo} && git reset --hard HEAD`, "/")))
  })

  test("stashing and checking out the session's own file are allowed", () => {
    assert.ok(silent(bash(`git -C ${repo} stash push -u -m parked`, "/")))
    assert.ok(silent(bash("git checkout -- mine.txt", repo)))
  })

  test("with only the session's own edits left, reset --hard is allowed", () => {
    git(repo, "checkout", "--", "theirs.txt")
    assert.ok(silent(bash(`git -C ${repo} reset --hard HEAD`, "/")))
  })
})

describe("pair-guard, where a big commit waits for the director", () => {
  const EDIT = used("Edit", { file_path: "/x" })
  const SPAWN = used("Agent", { name: "director", prompt: "review" })
  const REPLY: Line = {
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: '<teammate-message teammate_id="director">Go.</teammate-message>' }] }] },
  }
  const repo = repository()
  writeFileSync(join(repo, "big.txt"), "line\n".repeat(40))
  git(repo, "add", "big.txt")

  function commit(lines: Line[], { held = "pair", command = "git commit -m wip" } = {}) {
    const config = vars()
    run(MODE, ["mode", "set", held, "--session", "pg"], { env: config })
    const payload = { hook_event_name: "PreToolUse", tool_name: "Bash", session_id: "pg", cwd: repo, transcript_path: transcript(tmp, lines), tool_input: { command } }
    return fire("guards/pair-guard", payload, config)
  }

  test("forty staged lines with no director at all are denied, saying to spawn one", () => {
    assert.match(denial(commit([EDIT])) ?? "", /no director/)
  })

  test("an edit after the director's last answer is denied", () => {
    assert.match(denial(commit([SPAWN, REPLY, EDIT])) ?? "", /edited after/)
  })

  test("once the director answered after the last edit, the commit goes", () => {
    assert.ok(silent(commit([SPAWN, EDIT, REPLY])))
  })

  test("outside pair it says nothing", () => {
    assert.ok(silent(commit([EDIT], { held: "ic" })))
  })

  test("only what the commit records counts: an empty index commits freely, while -a and a named path count", () => {
    git(repo, "reset", "-q")
    appendFileSync(join(repo, "mine.txt"), "unstaged\n".repeat(40))
    assert.ok(silent(commit([EDIT])))
    assert.ok(denial(commit([EDIT], { command: "git commit -am wip" })))
    assert.ok(denial(commit([EDIT], { command: "git commit -m wip mine.txt" })))
  })
})
