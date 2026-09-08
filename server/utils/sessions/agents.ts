import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { readTextSafe } from "../mode/fsutil.ts"
import { projectsHome, teamsHome } from "./paths.ts"
import type { TranscriptRef } from "./transcripts.ts"
import type { SessionAgent } from "./types.ts"

function text(value: unknown): string | undefined {
  return typeof value === "string" && !!value.trim() ? value.trim() : undefined
}

function json(path: string): Record<string, unknown> | undefined {
  const raw = readTextSafe(path)
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === "object" && !!value ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function agentOf(value: unknown): SessionAgent | undefined {
  if (typeof value !== "object" || !value) return undefined
  const record = value as Record<string, unknown>
  const name = text(record.name)
  const color = text(record.color)
  // The lead carries no colour because it is the session itself, not one of its agents.
  return name && color ? { name, color } : undefined
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

// One tiny file per spawned agent, carrying its name and colour, written beside the transcript.
function fromSubagents(ref: TranscriptRef): SessionAgent[] {
  const dir = join(projectsHome(), ref.slug, ref.id, "subagents")
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return []
  }
  const metas = files.filter((file) => file.endsWith(".meta.json")).map((file) => join(dir, file))
  return metas
    .map((path) => ({ path, at: mtime(path) }))
    .sort((a, b) => a.at - b.at)
    .map((meta) => agentOf(json(meta.path)))
    .filter((agent): agent is SessionAgent => !!agent)
}

// Only a session with a team still on disk has this, so it stands in when subagents/ was pruned.
function fromTeam(key: string): SessionAgent[] {
  const config = json(join(teamsHome(), `session-${key}`, "config.json"))
  const members = config?.members
  if (!Array.isArray(members)) return []
  return members.map(agentOf).filter((agent): agent is SessionAgent => !!agent)
}

export function agentsOf(ref: TranscriptRef): SessionAgent[] {
  const found = fromSubagents(ref)
  const agents = found.length ? found : fromTeam(ref.key)
  const byName = new Map<string, SessionAgent>()
  for (const agent of agents) if (!byName.has(agent.name)) byName.set(agent.name, agent)
  return [...byName.values()]
}
