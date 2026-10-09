import { spawnSync } from "node:child_process"
import { gitCalls } from "../../lib/hook/git.ts"
import { armed } from "../../lib/hook/guard.ts"
import { deny, isRecord, payload, record, str, type Payload } from "../../lib/hook/io.ts"
import { Transcript, type Entry } from "../../lib/hook/transcript.ts"
import { modeConfig } from "../../lib/mode/config.ts"
import { held } from "../../lib/mode/state.ts"
import { lines, strip } from "../../lib/text.ts"

const DEFAULT_LINES = 30
const REPLY = 'teammate_id="director"'
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"])
const ALL_TRACKED = /^-[a-zA-Z]*a[a-zA-Z]*$/
// The options of `git commit` that take the next token as their value rather than as a path.
const VALUED = new Set([
  "-m", "--message", "-F", "--file", "-C", "--reuse-message", "-c", "--reedit-message", "--author",
  "--date", "--fixup", "--squash", "-t", "--template", "--cleanup", "--trailer", "-S", "--gpg-sign",
])
const VALUED_CLUSTER = /^-[a-zA-Z]*[mFCct]$/
const hatch = (limit: number): string =>
  `A commit of ${limit} changed lines or fewer goes through, and \`"disarm": ["pair-guard"]\` in ~/.claude/mode/config.json turns this off.`

// The paths a commit names, which it records from the working tree whatever the index holds.
function pathspecs(rest: string[]): string[] {
  const dash = rest.indexOf("--")
  if (dash >= 0) return rest.slice(dash + 1)
  const paths: string[] = []
  let skip = false
  for (const arg of rest) {
    if (skip) skip = false
    else if (VALUED.has(arg) || VALUED_CLUSTER.test(arg)) skip = true
    else if (!arg.startsWith("-")) paths.push(arg)
  }
  return paths
}

function changedLines(repo: string, rest: string[]): number {
  const paths = pathspecs(rest)
  const args = rest.includes("--all") || rest.some((arg) => ALL_TRACKED.test(arg))
    ? ["diff", "HEAD", "--numstat"]
    : paths.length ? ["diff", "HEAD", "--numstat", "--", ...paths] : ["diff", "--cached", "--numstat"]
  const done = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout: 10000 })
  if (done.error) throw done.error
  let total = 0
  for (const line of lines(done.stdout ?? "")) {
    const [added = "", deleted = ""] = line.split("\t")
    // A binary file reports "-" for both, and it still counts as a change somebody should see.
    total += /^\d+$/.test(added) ? Number(added) : 1
    total += /^\d+$/.test(deleted) ? Number(deleted) : 0
  }
  return total
}

function* strings(node: unknown): Generator<string> {
  if (typeof node === "string") yield node
  else if (Array.isArray(node)) for (const item of node) yield* strings(item)
  else if (isRecord(node)) for (const value of Object.values(node)) yield* strings(value)
}

// Whether a director exists, and whether it answered after the lead's last edit.
function review(entries: Entry[]): { spawned: boolean; seen: boolean } {
  let spawned = false
  let lastEdit = -1
  let lastReply = -1
  entries.forEach((entry, index) => {
    if (entry.isSidechain) return
    const content = Transcript.contentOf(entry)
    if (entry.type === "assistant" && Array.isArray(content)) {
      for (const item of content) {
        if (!isRecord(item) || item.type !== "tool_use") continue
        if (WRITE_TOOLS.has(str(item.name))) lastEdit = index
        if (item.name === "Agent" && record(item.input).name === "director") spawned = true
      }
    } else if (entry.type === "user" && [...strings(content)].some((text) => text.includes(REPLY))) {
      // A reply lands as its own message between turns, or inside a tool result when it arrives mid-turn.
      lastReply = index
    }
  })
  return { spawned, seen: lastReply > lastEdit }
}

// Python's int() on the config value: a whole number, a numeric string, or a boolean; anything else stops the guard.
function reviewLines(value: unknown): number {
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string" && /^[+-]?\d+$/.test(strip(value))) return Number(strip(value))
  throw new TypeError("review-lines is not a number")
}

function verdict(data: Payload): string | undefined {
  const commits = gitCalls(str(record(data.tool_input).command), str(data.cwd) || process.cwd()).filter(({ sub }) => sub === "commit")
  if (!commits.length || held("mode", str(data.session_id) || undefined) !== "pair") return undefined
  const config = modeConfig()
  const limit = "review-lines" in config ? reviewLines(config["review-lines"]) : DEFAULT_LINES
  const size = Math.max(...commits.map(({ repo, rest }) => changedLines(repo, rest)))
  const entries = Transcript.read(str(data.transcript_path))
  if (size <= limit || !entries.length) return undefined
  const { spawned, seen } = review(entries)
  if (seen) return undefined
  if (!spawned) {
    return `This commit records ${size} changed lines and no director has seen any of it. Spawn one with \`Agent\`, \`name\` set to \`director\`, send it the diff, and commit after its verdict. ${hatch(limit)}`
  }
  return `This commit records ${size} changed lines and you edited after the director last answered, so it has not seen what you are committing. Send it the diff with \`SendMessage\` and commit after its verdict. ${hatch(limit)}`
}

if (armed()) {
  try {
    const data = payload()
    const reason = data && data.tool_name === "Bash" && !data.agent_id ? verdict(data) : undefined
    if (reason) deny(`pair-guard: ${reason}`)
  } catch {}
}
