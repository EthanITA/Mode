import { pipelineFor } from "../mode/pipeline.ts"
import { slotOf } from "../mode/slot.ts"
import { sessions as modeSessions } from "../mode/sessions.ts"
import { agentsOf } from "./agents.ts"
import { artifactsOf, keysWithArtifacts } from "./artifact-lists.ts"
import { sessionColor } from "./identity.ts"
import { keyOf } from "./paths.ts"
import { liveEntries, type RegistryEntry } from "./registry.ts"
import { cwdFromSlug } from "./slug.ts"
import { identityOf, transcriptIndex, type TranscriptIdentity, type TranscriptRef } from "./transcripts.ts"
import type { LiveSession } from "./types.ts"

// The rejected build rendered a bare hex id as a title; a name that IS the id is not a name.
function realName(candidate: string | undefined, key: string, id: string): string | undefined {
  if (!candidate) return undefined
  const trimmed = candidate.trim()
  if (!trimmed || trimmed === key || trimmed === id || /^[0-9a-f]{8}$/.test(trimmed)) return undefined
  return trimmed
}

function build(key: string, entry: RegistryEntry | undefined, ref: TranscriptRef | undefined): LiveSession | undefined {
  const id = entry?.id || ref?.id
  // Neither a live process nor a transcript means nothing on disk can say what this session was.
  if (!id) return undefined
  const identity: TranscriptIdentity = ref ? identityOf(ref) : { names: [] }
  const cwd = entry?.cwd || identity.cwd || (ref ? cwdFromSlug(ref.slug) : undefined)
  if (!cwd) return undefined
  return {
    id,
    key,
    name: [entry?.name, ...identity.names].map((one) => realName(one, key, id)).find(Boolean),
    cwd,
    live: !!entry,
    color: sessionColor(key),
    slots: { mode: slotOf("mode", key), style: slotOf("style", key) },
    pipeline: pipelineFor(key),
    artifacts: artifactsOf(key),
    agents: ref ? agentsOf(ref) : undefined,
    status: entry?.status,
    gitBranch: identity.gitBranch,
    lastActive: Math.round(Math.max(entry?.updatedAt || 0, ref?.mtimeMs || 0)) || undefined,
  }
}

// Live first because the design shows only those as tabs; the rest is history, newest first.
function order(a: LiveSession, b: LiveSession): number {
  if (a.live !== b.live) return a.live ? -1 : 1
  return (b.lastActive || 0) - (a.lastActive || 0)
}

export function liveSessions(): LiveSession[] {
  const entries = new Map(liveEntries().map((entry) => [keyOf(entry.id), entry]))
  const transcripts = transcriptIndex()
  const keys = new Set<string>([
    ...entries.keys(),
    ...keysWithArtifacts(),
    ...modeSessions().map((session) => session.id),
  ])
  const out: LiveSession[] = []
  for (const key of keys) {
    const session = build(key, entries.get(key), transcripts.get(key))
    if (session) out.push(session)
  }
  return out.sort(order)
}

export type { LiveSession, SessionAgent, SessionStatus } from "./types.ts"
