import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import type { TreeEntry, TreeListing } from "../../../shared/types/tree.ts"
import { keyOf } from "../sessions/paths.ts"
import { liveEntries } from "../sessions/registry.ts"
import { cwdFromSlug } from "../sessions/slug.ts"
import { identityOf, transcriptIndex } from "../sessions/transcripts.ts"

export interface ListingOptions {
  root: string
  dir: string
  showIgnored: boolean
}

// The live process knows its cwd first; an ended conversation still has its transcript's.
export function cwdOf(key: string): string | undefined {
  const live = liveEntries().find((entry) => keyOf(entry.id) === key)?.cwd
  if (live) return live
  const ref = transcriptIndex().get(key)
  return ref ? identityOf(ref).cwd || cwdFromSlug(ref.slug) : undefined
}

export function isInside(root: string, path: string): boolean {
  const from = resolve(root)
  const to = resolve(path)
  return to === from || to.startsWith(from + sep)
}

// Git decides what is ignored, so nested .gitignore files, excludes and tracked exceptions all hold.
function ignoredOf(root: string, candidates: string[]): Set<string> {
  if (!candidates.length) return new Set()
  const run = spawnSync("git", ["-C", root, "check-ignore", "--stdin", "-z"], {
    encoding: "utf8",
    input: candidates.join("\0"),
    timeout: 4000,
  })
  // Exit 1 means nothing matched and 128 means not a repository, which both read as nothing ignored.
  if (run.status !== 0 || !run.stdout) return new Set()
  return new Set(run.stdout.split("\0").filter(Boolean))
}

export function listingOf({ root, dir, showIgnored }: ListingOptions): TreeListing | undefined {
  const at = resolve(root, dir)
  if (!isInside(root, at)) return undefined
  let names: { name: string; isDir: boolean }[]
  try {
    names = readdirSync(at, { withFileTypes: true })
      .filter((one) => one.name !== ".git")
      .map((one) => ({ name: one.name, isDir: one.isDirectory() }))
  } catch {
    return undefined
  }
  const relativeOf = (name: string, isDir: boolean): string => relative(root, join(at, name)) + (isDir ? "/" : "")
  const ignored = ignoredOf(root, names.map((one) => relativeOf(one.name, one.isDir)))
  const entries: TreeEntry[] = names
    .map((one) => ({
      name: one.name,
      path: join(at, one.name),
      kind: one.isDir ? ("dir" as const) : ("file" as const),
      ...(ignored.has(relativeOf(one.name, one.isDir)) ? { ignored: true as const } : {}),
    }))
    .filter((entry) => showIgnored || !entry.ignored)
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))
  return { root, dir: at, entries }
}
