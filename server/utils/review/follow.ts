import { execFile } from "node:child_process"
import { join } from "node:path"
import type { FollowTarget } from "../../../shared/types/review.ts"
import { readTextSafe } from "../mode/fsutil.ts"
import { keyOf } from "../sessions/paths.ts"
import { liveEntries, type RegistryEntry } from "../sessions/registry.ts"
import { reviewHome } from "./ledger.ts"

// Guarded on `is running`: a bare `tell application` would launch Terminal just to ask it.
const SCRIPT = `if application "Terminal" is running then
  tell application "Terminal"
    set out to ""
    repeat with i from 1 to count of windows
      set t to selected tab of window i
      set out to out & i & (character id 9) & (custom title of t) & linefeed
    end repeat
    return out
  end tell
end if`

// Several open pages share one read, and one osascript call takes about a tenth of a second.
const FRESH_MS = 800

let last: { at: number; target: FollowTarget } | undefined

function frontTitle(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", SCRIPT], { timeout: 2000 }, (error, stdout) => {
      const [front] = error ? [] : String(stdout).split("\n")
      resolve(front?.split("\t")[1])
    })
  })
}

// Claude Code prefixes a busy session's title with a spinner glyph that changes on every read.
function nameOf(title: string): string {
  return title.replace(/^[^\p{L}\p{N}[]+/u, "").trim()
}

function newest(entries: RegistryEntry[]): RegistryEntry | undefined {
  return [...entries].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
}

function promptedLast(live: RegistryEntry[]): RegistryEntry | undefined {
  const raw = readTextSafe(join(reviewHome(), "focus.json"))
  if (!raw) return undefined
  try {
    const { session } = JSON.parse(raw) as { session?: string }
    return live.find((entry) => entry.id === session)
  } catch {
    return undefined
  }
}

export async function followTarget(): Promise<FollowTarget> {
  const now = Date.now()
  if (last && now - last.at < FRESH_MS) return last.target
  const live = liveEntries()
  const title = await frontTitle()
  const name = title ? nameOf(title) : ""
  const terminal = name ? newest(live.filter((entry) => entry.name === name)) : undefined
  const prompted = terminal ? undefined : promptedLast(live)
  const hit = terminal ?? prompted
  const target: FollowTarget = hit
    ? { key: keyOf(hit.id), name: hit.name, source: terminal ? "terminal" : "prompt" }
    : { source: "none" }
  last = { at: now, target }
  return target
}
