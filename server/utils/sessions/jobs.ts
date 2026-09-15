import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { SessionLane, SessionStatus } from "../../../shared/types/session.ts"
import { readTextSafe } from "../mode/fsutil.ts"
import { configRoot } from "../mode/paths.ts"
import { isAlive } from "./registry.ts"
import { isKey, isSessionId, jobsHome, keyOf, registryHome } from "./paths.ts"

export interface JobEntry {
  key: string
  id: string
  cwd?: string
  name?: string
  lane: SessionLane
  pid?: number
  status?: SessionStatus
  startedAt?: number
}

const LANES = ["review", "blocked", "working", "done"] as const
const CACHE_MS = 4000
const CLI_TIMEOUT_MS = 10000

let cached: JobEntry[] | undefined
let cachedAt = 0
let cachedRoot = ""

function text(value: unknown): string | undefined {
  return typeof value === "string" && !!value.trim() ? value.trim() : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function status(value: unknown): SessionStatus | undefined {
  return value === "busy" || value === "idle" ? value : undefined
}

function lane(value: unknown): SessionLane["name"] {
  return LANES.find((one) => one === value) || "done"
}

// The installer keeps this symlink current; a Nitro process may not inherit a login shell's PATH.
function binary(): string {
  const set = process.env.CLAUDE_BIN
  if (set) return set
  const installed = join(homedir(), ".local", "bin", "claude")
  return existsSync(installed) ? installed : "claude"
}

function fromCli(): JobEntry[] | undefined {
  let raw: string
  try {
    raw = execFileSync(binary(), ["agents", "--json", "--all"], { encoding: "utf8", timeout: CLI_TIMEOUT_MS })
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed)) return undefined
  const out: JobEntry[] = []
  for (const row of parsed) {
    if (typeof row !== "object" || !row) continue
    const record = row as Record<string, unknown>
    const id = text(record.sessionId)
    const key = text(record.id)
    if (!id || !isSessionId(id) || !key || !isKey(key)) continue
    out.push({
      key,
      id,
      cwd: text(record.cwd),
      name: text(record.name),
      lane: { name: lane(record.state) },
      pid: num(record.pid),
      status: status(record.status),
      startedAt: num(record.startedAt),
    })
  }
  return out
}

function liveBySession(): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  let names: string[]
  try {
    names = readdirSync(registryHome())
  } catch {
    return out
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    const raw = readTextSafe(join(registryHome(), name))
    if (!raw) continue
    try {
      const value = JSON.parse(raw)
      if (typeof value !== "object" || !value) continue
      const record = value as Record<string, unknown>
      const id = text(record.sessionId)
      if (id) out.set(id, record)
    } catch {
      continue
    }
  }
  return out
}

/* The CLI derives the lane from more than the file holds, so a job read straight off disk can
   disagree with what `claude agents` shows. Such a row is marked derived rather than passed off. */
function fromDisk(): JobEntry[] {
  let names: string[]
  try {
    names = readdirSync(jobsHome())
  } catch {
    return []
  }
  const live = liveBySession()
  const out: JobEntry[] = []
  for (const name of names) {
    if (!isKey(name)) continue
    const raw = readTextSafe(join(jobsHome(), name, "state.json"))
    if (!raw) continue
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      continue
    }
    if (typeof value !== "object" || !value) continue
    const record = value as Record<string, unknown>
    const id = text(record.sessionId)
    if (!id || !isSessionId(id) || keyOf(id) !== name) continue
    const held = live.get(id)
    const pid = num(held?.pid)
    out.push({
      key: name,
      id,
      cwd: text(record.cwd),
      name: text(record.name),
      lane: { name: lane(record.state), derived: true },
      pid: pid && isAlive(pid) ? pid : undefined,
      status: pid && isAlive(pid) ? status(held?.status) : undefined,
      startedAt: num(held?.startedAt),
    })
  }
  return out
}

export function jobs(): JobEntry[] {
  const now = Date.now()
  const root = configRoot()
  if (cached && root === cachedRoot && now - cachedAt < CACHE_MS) return cached
  cached = fromCli() ?? fromDisk()
  cachedAt = now
  cachedRoot = root
  return cached
}
