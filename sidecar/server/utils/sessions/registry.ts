import { readdirSync } from "node:fs"
import { join } from "node:path"
import { readTextSafe } from "../mode/fsutil.ts"
import { isSessionId, registryHome } from "./paths.ts"
import type { SessionStatus } from "./types.ts"

export interface RegistryEntry {
  pid: number
  id: string
  cwd?: string
  name?: string
  status?: SessionStatus
  updatedAt?: number
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && !!value.trim() ? value.trim() : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function status(value: unknown): SessionStatus | undefined {
  return value === "busy" || value === "idle" ? value : undefined
}

// Signal 0 tests for the process without touching it; EPERM means alive but owned by someone else.
export function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

function parse(path: string): RegistryEntry | undefined {
  const raw = readTextSafe(path)
  if (!raw) return undefined
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof value !== "object" || !value) return undefined
  const record = value as Record<string, unknown>
  const pid = num(record.pid)
  const id = text(record.sessionId)
  if (!pid || !id || !isSessionId(id)) return undefined
  return {
    pid,
    id,
    cwd: text(record.cwd),
    name: text(record.name),
    status: status(record.status),
    updatedAt: num(record.updatedAt) || num(record.startedAt),
  }
}

// A session that resumed under a new pid leaves the old file behind, so the newest write wins.
function newest(a: RegistryEntry, b: RegistryEntry): RegistryEntry {
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a
}

export function liveEntries(): RegistryEntry[] {
  let names: string[]
  try {
    names = readdirSync(registryHome())
  } catch {
    return []
  }
  const byId = new Map<string, RegistryEntry>()
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    const entry = parse(join(registryHome(), name))
    if (!entry || !isAlive(entry.pid)) continue
    const seen = byId.get(entry.id)
    byId.set(entry.id, seen ? newest(seen, entry) : entry)
  }
  return [...byId.values()]
}
