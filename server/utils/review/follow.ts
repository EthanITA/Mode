import type { FollowSource, FollowTarget } from "../../../shared/types/review.ts"
import { keyOf } from "../sessions/paths.ts"
import { liveEntries } from "../sessions/registry.ts"

type Listener = (target: FollowTarget) => void

let target: FollowTarget = { source: "none" }
const listeners = new Set<Listener>()

export function followTarget(): FollowTarget {
  return target
}

// The session says where the person is, `/sidecar` or a keystroke in its prompt, so nothing polls a terminal.
export function pointAt({ key, source }: { key: string; source: Exclude<FollowSource, "none"> }): number {
  const entry = liveEntries().find((one) => keyOf(one.id) === key)
  target = { key, name: entry?.name, source }
  for (const listener of listeners) listener(target)
  return listeners.size
}

export function onFollow(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
