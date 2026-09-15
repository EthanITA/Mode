import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { readTextSafe } from "../mode/fsutil.ts"
import { configRoot, stateHome } from "../mode/paths.ts"
import { artifactListsHome, canvasHome, isKey, jobsHome, keyOf, teamsHome } from "./paths.ts"
import { isAlive, liveEntries } from "./registry.ts"
import { jobs } from "./jobs.ts"

export interface Removal {
  key: string
  removed: string[]
  killed?: boolean
  refused?: string
}

const KILL_DEADLINE_MS = 3000
const KILL_POLL_MS = 100

function stateOf(key: string): Record<string, unknown> | undefined {
  const raw = readTextSafe(join(jobsHome(), key, "state.json"))
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw)
    return typeof value === "object" && value ? value as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function commandOf(pid: number): string {
  try {
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 2000 }).trim()
  } catch {
    return ""
  }
}

/* A settled pid can be recycled onto an unrelated program, and the recorded start time is in a
   different timezone than `ps` reports, so ownership is proven from the command line instead. */
function ours(pid: number): boolean {
  return commandOf(pid).toLowerCase().includes("claude")
}

// A job's tmp can host a long-running server; removing the directory would kill it mid-flight.
function holder(dir: string): number | undefined {
  for (const entry of liveEntries()) {
    if (entry.cwd?.startsWith(`${dir}/`) || entry.cwd === dir) return entry.pid
  }
  let listing: string
  try {
    listing = execFileSync("ps", ["-Ao", "pid=,command="], { encoding: "utf8", timeout: 5000 })
  } catch {
    return undefined
  }
  for (const line of listing.split("\n")) {
    if (!line.includes(dir)) continue
    const pid = Number.parseInt(line.trim().split(/\s+/)[0] || "", 10)
    if (pid && pid !== process.pid && isAlive(pid)) return pid
  }
  return undefined
}

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

async function kill(pid: number): Promise<boolean> {
  try {
    process.kill(pid, "SIGTERM")
  } catch {
    return !isAlive(pid)
  }
  const until = Date.now() + KILL_DEADLINE_MS
  while (Date.now() < until) {
    if (!isAlive(pid)) return true
    await wait(KILL_POLL_MS)
  }
  return !isAlive(pid)
}

function targets(key: string): string[] {
  const state = stateHome()
  const modeFiles = (() => {
    try {
      return readdirSync(state)
        .filter((name) => name === `session-${key}` || name.startsWith(`session-${key}.`))
        .map((name) => join(state, name))
    } catch {
      return []
    }
  })()
  return [
    join(jobsHome(), key),
    join(artifactListsHome(), `session-${key}`),
    join(canvasHome(), `session-${key}`),
    join(configRoot(), "tasks", `session-${key}`),
    join(teamsHome(), `session-${key}`),
    join(configRoot(), "mode", "versions", key),
    ...modeFiles,
  ]
}

export async function removeSession(key: string): Promise<Removal> {
  if (!isKey(key)) return { key, removed: [], refused: "not a session key" }

  const state = stateOf(key)
  const id = typeof state?.sessionId === "string" ? state.sessionId : undefined
  // The key is a truncation of the uuid, so a mismatch means this directory is somebody else's.
  if (state && (!id || keyOf(id) !== key)) {
    return { key, removed: [], refused: "the job's state file does not key to this session" }
  }
  const isolation = state?.bgIsolation
  if (isolation && isolation !== "none") {
    return { key, removed: [], refused: `the job runs in ${String(isolation)} isolation; remove it with \`claude agents\`` }
  }

  const job = jobs().find((one) => one.key === key)
  const dir = join(jobsHome(), key)
  let killed: boolean | undefined
  if (job?.pid && isAlive(job.pid)) {
    if (!ours(job.pid)) {
      return { key, removed: [], refused: `pid ${job.pid} is not a Claude process; refusing to signal it` }
    }
    killed = await kill(job.pid)
    if (!killed) return { key, removed: [], killed: false, refused: `pid ${job.pid} did not stop` }
  }

  const held = existsSync(dir) ? holder(dir) : undefined
  if (held) return { key, removed: [], killed, refused: `pid ${held} is running inside the job directory` }

  const root = configRoot()
  const removed: string[] = []
  for (const target of targets(key)) {
    if (!target.startsWith(`${root}/`) || !existsSync(target)) continue
    try {
      rmSync(target, { recursive: true, force: true })
      removed.push(target)
    } catch {
      return { key, removed, killed, refused: `could not remove ${target}` }
    }
  }
  return { key, removed, killed }
}
