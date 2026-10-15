import type { LiveSession } from "../../../shared/types/session.ts";
import { sessionOrder } from "../../../shared/utils/sessions.ts";
import { pipelineFor } from "../../../lib/mode/pipeline.ts";
import { sessions as modeSessions, slotOf } from "../../../lib/mode/sessions.ts";
import { agentsOf } from "./agents.ts";
import { artifactsOf, keysWithArtifacts } from "./artifact-lists.ts";
import { sessionColor } from "./identity.ts";
import { jobs, type JobEntry } from "./jobs.ts";
import { keyOf } from "./paths.ts";
import { liveEntries, type RegistryEntry } from "./registry.ts";
import { cwdFromSlug } from "./slug.ts";
import { identityOf, transcriptIndex, type TranscriptIdentity, type TranscriptRef } from "./transcripts.ts";

// The rejected build rendered a bare hex id as a title; a name that IS the id is not a name.
function realName(candidate: string | undefined, key: string, id: string): string | undefined {
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed === key || trimmed === id || /^[0-9a-f]{8}$/.test(trimmed)) return undefined;
  return trimmed;
}

interface Sources {
  entry?: RegistryEntry;
  job?: JobEntry;
  ref?: TranscriptRef;
}

function build(key: string, { entry, job, ref }: Sources): LiveSession | undefined {
  const id = job?.id || entry?.id || ref?.id;
  // Neither a job, a live process nor a transcript means nothing on disk can say what this session was.
  if (!id) return undefined;
  const identity: TranscriptIdentity = ref ? identityOf(ref) : { names: [] };
  const cwd = job?.cwd || entry?.cwd || identity.cwd || (ref ? cwdFromSlug(ref.slug) : undefined);
  if (!cwd) return undefined;
  return {
    id,
    key,
    name: [job?.name, entry?.name, ...identity.names].map((one) => realName(one, key, id)).find(Boolean),
    cwd,
    live: !!entry || !!job?.pid,
    color: sessionColor(key),
    slots: { mode: slotOf("mode", key), style: slotOf("style", key) },
    pipeline: pipelineFor(key),
    artifacts: artifactsOf(key),
    agents: ref ? agentsOf(ref) : undefined,
    status: job?.status || entry?.status,
    gitBranch: identity.gitBranch,
    lastActive: Math.round(Math.max(entry?.updatedAt || 0, ref?.mtimeMs || 0, job?.startedAt || 0)) || undefined,
    lane: job?.lane,
    detail: job?.detail,
    archived: job ? undefined : true,
    startedAt: job?.startedAt,
  };
}

export interface SessionsQuery {
  scope?: "all" | "live";
  key?: string;
}

// `live` is what a poll can see change: processes and jobs, plus the conversation on screen.
export function liveSessions({ scope = "all", key }: SessionsQuery = {}): LiveSession[] {
  const entries = new Map(liveEntries().map((entry) => [keyOf(entry.id), entry]));
  const running = new Map(jobs().map((job) => [job.key, job]));
  const transcripts = transcriptIndex();
  const keys = new Set<string>([...running.keys(), ...entries.keys()]);
  if (key) keys.add(key);
  if (scope === "all")
    for (const one of [...keysWithArtifacts(), ...modeSessions().map((session) => session.id)]) keys.add(one);
  const out: LiveSession[] = [];
  for (const one of keys) {
    const session = build(one, { entry: entries.get(one), job: running.get(one), ref: transcripts.get(one) });
    if (session) out.push(session);
  }
  return out.sort(sessionOrder);
}
