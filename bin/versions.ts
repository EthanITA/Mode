#!/usr/bin/env -S node --experimental-strip-types
import { execFileSync } from "node:child_process"
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, normalize } from "node:path"
import { configRoot } from "../server/utils/mode/paths.ts"
import { splitLines } from "../server/utils/mode/fsutil.ts"
import { receiptsOf, turnsOf } from "../server/utils/sessions/receipts.ts"
import { identityOf, transcriptIndex } from "../server/utils/sessions/transcripts.ts"
import { planOf, storePath } from "../server/utils/sessions/store.ts"
import type {
  BaselineOrigin,
  ConversationVersions,
  DiffGap,
  DiffTarget,
  FileDiff,
  FileVersion,
  RestoreResult,
  VersionContent,
} from "../shared/types/versions.ts"

const LOCK_STALE_MS = 60_000

interface IndexedFile {
  baseline: BaselineOrigin
  skipped?: string
  versions: FileVersion[]
}

interface StoreIndex {
  key: string
  id: string
  size: number
  turns: number
  bytes: number
  capped?: boolean
  files: Record<string, IndexedFile>
}

function storeHome(): string {
  return join(configRoot(), "mode", "versions")
}

function storeDir(key: string): string {
  return join(storeHome(), key)
}

function treeDir(key: string): string {
  return join(storeDir(key), "tree")
}

function git(key: string, args: string[]): string {
  return execFileSync("git", args, { cwd: treeDir(key), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
}

function readIndex(key: string): StoreIndex | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(storeDir(key), "index.json"), "utf8"))
    return typeof parsed === "object" && !!parsed ? (parsed as StoreIndex) : undefined
  } catch {
    return undefined
  }
}

function writeIndex(index: StoreIndex): void {
  mkdirSync(storeDir(index.key), { recursive: true })
  writeFileSync(join(storeDir(index.key), "index.json"), JSON.stringify(index))
}

// A browser polling two panels and a rebuild from the CLI would otherwise share one git index.
function withLock<T>(key: string, run: () => T): T {
  const path = join(storeDir(key), "lock")
  mkdirSync(storeDir(key), { recursive: true })
  for (let attempt = 0; ; attempt++) {
    try {
      closeSync(openSync(path, "wx"))
      break
    } catch {
      const age = Date.now() - (statSync(path, { throwIfNoEntry: false })?.mtimeMs || 0)
      if (age > LOCK_STALE_MS) unlinkSync(path)
      else if (attempt > 200) throw new Error(`version store for ${key} is locked`)
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  try {
    return run()
  } finally {
    try {
      unlinkSync(path)
    } catch {}
  }
}

function init(key: string): void {
  rmSync(storeDir(key), { recursive: true, force: true })
  mkdirSync(treeDir(key), { recursive: true })
  git(key, ["init", "-q", "-b", "main"])
  git(key, ["config", "user.name", "sidecar"])
  git(key, ["config", "user.email", "sidecar@local"])
  git(key, ["config", "core.autocrlf", "false"])
}

function commit(key: string, { message, by, at }: { message: string; by: string; at: number }): void {
  const stamp = new Date(at).toISOString()
  git(key, ["add", "-A", "."])
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", message, "--author", `${by || "session"} <sidecar@local>`], {
    cwd: treeDir(key),
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
  })
}

/* The mirror follows whatever the transcript last said a path was, and a path can be a file in one
   turn and a directory in the next. Either shape blocks the other: rm on a directory throws EISDIR
   and mkdir under a file throws ENOTDIR, and one such path aborted the whole build. */
function clearShape(root: string, target: string): void {
  if (statSync(target, { throwIfNoEntry: false })?.isDirectory()) rmSync(target, { force: true, recursive: true })
  for (let dir = dirname(target); dir.startsWith(root) && dir !== root; dir = dirname(dir)) {
    const found = statSync(dir, { throwIfNoEntry: false })
    if (!found) continue
    if (found.isDirectory()) break
    rmSync(dir, { force: true })
  }
}

function put({ key, path, content }: { key: string; path: string; content?: string }): void {
  const root = treeDir(key)
  const target = join(root, storePath(path))
  clearShape(root, target)
  if (typeof content !== "string") {
    rmSync(target, { force: true, recursive: true })
    return
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function build(key: string): StoreIndex {
  const ref = transcriptIndex().get(key)
  const empty: StoreIndex = { key, id: "", size: 0, turns: 0, bytes: 0, files: {} }
  if (!ref) return empty
  const known = readIndex(key)
  if (known && known.id === ref.id && known.size === ref.size && existsSync(treeDir(key))) return known

  const { turns } = turnsOf({ key })
  const plan = planOf(turns)
  const who = identityOf(ref).names[0] || key
  const fresh = !known || known.id !== ref.id || known.turns > plan.plans.length || !existsSync(treeDir(key))
  if (fresh) init(key)
  const from = fresh ? 0 : known.turns

  // Built over every turn, not only the newly committed ones, so an incremental run keeps the
  // attribution of versions it is not re-committing.
  const marks = new Map<string, Map<number, { by: string; deleted?: true }>>()
  for (const turn of plan.plans) {
    for (const file of turn.files) {
      const byTurn = marks.get(file.path) || new Map<number, { by: string; deleted?: true }>()
      byTurn.set(turn.turn, { by: file.by || who, deleted: typeof file.content === "string" ? undefined : true })
      marks.set(file.path, byTurn)
    }
    if (turn.turn <= from) continue
    if (turn.baselines.length) {
      for (const file of turn.baselines) put({ key, path: file.path, content: file.content })
      commit(key, { message: `baseline before turn ${turn.turn}`, by: who, at: turn.at })
    }
    if (!turn.files.length) continue
    for (const file of turn.files) put({ key, path: file.path, content: file.content })
    commit(key, { message: `turn ${turn.turn}`, by: turn.by || who, at: turn.at })
  }

  const index: StoreIndex = {
    key,
    id: ref.id,
    size: ref.size,
    turns: plan.plans.length,
    bytes: dirBytes(treeDir(key)),
    capped: plan.capped,
    files: {},
  }
  for (const [path, source] of plan.baselines) index.files[path] = { baseline: source, versions: [] }
  for (const [path, reason] of plan.skipped) index.files[path] = { baseline: plan.baselines.get(path) || "unknown", skipped: reason, versions: [] }
  hydrate({ key, index, plans: plan.plans, marks, who })
  writeIndex(index)
  return index
}

type Marks = Map<string, Map<number, { by: string; deleted?: true }>>

// One `git log --numstat` beats a diff per version: the whole line count arrives in a single pass.
function hydrate({
  key,
  index,
  plans,
  marks,
  who,
}: {
  key: string
  index: StoreIndex
  plans: { turn: number; at: number }[]
  marks: Marks
  who: string
}): void {
  const log = git(key, ["log", "--reverse", "--numstat", "--format=%x00%H %s", "--no-renames"])
  const at = new Map(plans.map((one) => [one.turn, one.at]))
  let turn = 0
  let sha = ""
  for (const line of log.split("\n")) {
    if (line.startsWith("\0")) {
      const [head, ...rest] = line.slice(1).split(" ")
      sha = head || ""
      const match = /^turn (\d+)$/.exec(rest.join(" "))
      turn = match ? Number(match[1]) : 0
      continue
    }
    if (!turn || !line.trim()) continue
    const [added, removed, file] = line.split("\t")
    if (!file) continue
    const path = "/" + file
    const entry = index.files[path] || { baseline: "unknown", versions: [] }
    const mark = marks.get(path)?.get(turn)
    entry.versions.push({
      path,
      turn,
      at: at.get(turn) || 0,
      by: mark?.by || who,
      sha,
      bytes: blobBytes({ key, sha, file }),
      added: Number(added) || 0,
      removed: Number(removed) || 0,
      created: !entry.versions.length && entry.baseline === "absent" ? true : undefined,
      deleted: mark?.deleted,
    })
    index.files[path] = entry
  }
}

function blobBytes({ key, sha, file }: { key: string; sha: string; file: string }): number {
  try {
    return Number(git(key, ["cat-file", "-s", `${sha}:${file}`]).trim()) || 0
  } catch {
    return 0
  }
}

function dirBytes(dir: string): number {
  try {
    return Number(execFileSync("du", ["-sk", dir], { encoding: "utf8" }).split("\t")[0]) * 1024
  } catch {
    return 0
  }
}

// The store is a cache: every byte of it is rebuildable from the transcript, so dropping the
// coldest conversations costs nothing but the next rebuild.
function prune(keep: number): { kept: string[]; dropped: string[]; bytes: number } {
  let keys: string[]
  try {
    keys = readdirSync(storeHome())
  } catch {
    return { kept: [], dropped: [], bytes: 0 }
  }
  const ranked = keys
    .map((key) => ({ key, at: statSync(join(storeDir(key), "index.json"), { throwIfNoEntry: false })?.mtimeMs || 0 }))
    .sort((a, b) => b.at - a.at)
  const dropped = ranked.slice(keep).map((one) => one.key)
  for (const key of dropped) rmSync(storeDir(key), { recursive: true, force: true })
  const kept = ranked.slice(0, keep).map((one) => one.key)
  return { kept, dropped, bytes: kept.reduce((sum, key) => sum + dirBytes(storeDir(key)), 0) }
}

function versionsOf(index: StoreIndex, path?: string): ConversationVersions {
  const entries = Object.entries(index.files).filter(([one]) => !path || one === path)
  return {
    key: index.key,
    turns: index.turns,
    bytes: index.bytes,
    capped: index.capped,
    files: entries
      .filter(([, file]) => file.versions.length || file.skipped || file.baseline === "unknown")
      .map(([one, file]) => ({ path: one, baseline: file.baseline, versions: file.versions, skipped: file.skipped })),
  }
}

interface At {
  key: string
  index: StoreIndex
  path: string
  turn: number
}

interface Range extends Omit<At, "turn"> {
  from: number
  to: DiffTarget
}

function versionAt({ index, path, turn }: Omit<At, "key">): FileVersion | undefined {
  const versions = index.files[path]?.versions || []
  let found: FileVersion | undefined
  for (const version of versions) if (version.turn <= turn) found = version
  return found
}

function show({ key, index, path, turn }: At): VersionContent {
  const entry = index.files[path]
  const version = versionAt({ index, path, turn })
  if (!version) {
    const reason: DiffGap = entry?.skipped ? "skipped" : entry?.baseline === "unknown" ? "unknown-baseline" : "unresolved-target"
    return { path, turn, found: false, reason }
  }
  try {
    return { path, turn: version.turn, found: true, content: git(key, ["show", `${version.sha}:${storePath(path)}`]) }
  } catch {
    return { path, turn: version.turn, found: false, reason: "missing-content" }
  }
}

function resolveTarget({ index, path, from, to }: Omit<Range, "key">): FileVersion | undefined {
  const versions = index.files[path]?.versions || []
  if (to === "head") return versions[versions.length - 1]
  if (to === "next") return versions.find((one) => one.turn > from)
  return versionAt({ index, path, turn: to })
}

function diff({ key, index, path, from, to }: Range): FileDiff {
  const entry = index.files[path]
  const gap = (reason: DiffGap): FileDiff => ({ path, from, to, computed: false, reason })
  if (entry?.skipped) return gap("skipped")
  const b = resolveTarget({ index, path, from, to })
  const a = versionAt({ index, path, turn: from })
  // Checked before the missing target: an empty patch would read as "nothing changed".
  if (!a && entry?.baseline === "unknown") return gap("unknown-baseline")
  if (!b) return gap(entry?.versions.length ? "unresolved-target" : "missing-content")
  // Both sides on one commit is a real no-change, the only place an empty patch is honest.
  if (a && a.sha === b.sha) return { path, from, to, computed: true, patch: "", added: 0, removed: 0 }
  const left = a ? a.sha : parentOf(key, b.sha)
  const file = storePath(path)
  const patch = git(key, ["diff", "--no-prefix", left, b.sha, "--", file])
  const [added, removed] = patch ? git(key, ["diff", "--numstat", left, b.sha, "--", file]).split("\t").map(Number) : []
  return { path, from, to, computed: true, patch, added: added || 0, removed: removed || 0 }
}

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

// A file first touched late has no version at from-1; its baseline commit is that version's parent.
function parentOf(key: string, sha: string): string {
  try {
    return git(key, ["rev-parse", "--verify", `${sha}^`]).trim()
  } catch {
    return EMPTY_TREE
  }
}

function restore({ key, index, path, turn, force }: At & { force?: boolean }): RestoreResult {
  const refuse = (reason: string): RestoreResult => ({ path, turn, restored: false, forceable: false, reason })
  if (!isAbsolute(path) || normalize(path) !== path) return refuse("path is not a plain absolute path")
  if (!index.files[path]?.versions.length) return refuse("no version of this file in the store")
  const version = show({ key, index, path, turn })
  if (!version.found) return refuse("that turn has no version of this file")
  if (!existsSync(dirname(path))) return refuse("the parent directory no longer exists")
  if (!force && foreign({ key, index, path })) {
    return {
      path,
      turn,
      restored: false,
      forceable: true,
      reason: "the file on disk holds work this conversation never wrote, so restoring would overwrite it",
    }
  }
  writeFileSync(path, version.content)
  return { path, turn: version.turn, restored: true, forceable: false }
}

// Matching any stored version is enough: an earlier restore also leaves disk off head, and
// refusing that would make every restore after the first need force.
function foreign({ key, index, path }: Omit<At, "turn">): boolean {
  const versions = index.files[path]?.versions || []
  if (!existsSync(path) || !versions.length) return false
  try {
    const disk = git(key, ["hash-object", "--", path]).trim()
    const blobs = git(key, ["rev-parse", ...versions.map((one) => `${one.sha}:${storePath(path)}`)])
    return !splitLines(blobs).some((one) => one.trim() === disk)
  } catch {
    return true
  }
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 ? process.argv[at + 1] : undefined
}

function target(): DiffTarget {
  const raw = arg("to") || "head"
  if (raw === "head" || raw === "next") return raw
  return Number(raw) || 0
}

function need(name: string): string {
  const value = arg(name)
  if (!value) throw new Error(`--${name} is required`)
  return value
}

function main(): void {
  const [command, key] = process.argv.slice(2)
  const keep = Number(arg("keep"))
  if (command === "prune") return out(prune(Number.isFinite(keep) ? keep : 20))
  if (!command || !key || key.startsWith("--"))
    throw new Error("usage: versions <build|list|show|diff|restore|receipts|prune> <key> [--path P] [--turn N] [--from N] [--to N|head|next] [--keep N]")
  if (command === "receipts") return out(receiptsOf({ key }))
  const index = withLock(key, () => build(key))
  if (command === "build" || command === "list") return out(versionsOf(index, arg("path")))
  if (command === "show") return out(show({ key, index, path: need("path"), turn: Number(need("turn")) }))
  if (command === "diff") return out(diff({ key, index, path: need("path"), from: Number(need("from")), to: target() }))
  if (command === "restore")
    return out(withLock(key, () => restore({ key, index, path: need("path"), turn: Number(need("turn")), force: process.argv.includes("--force") })))
  throw new Error(`unknown command ${command}`)
}

function out(value: unknown): void {
  process.stdout.write(JSON.stringify(value))
}

try {
  main()
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
