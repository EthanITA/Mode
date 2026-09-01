import { closeSync, fstatSync, openSync, readSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { splitLines } from "../mode/fsutil.ts"
import { isKey, isSessionId, keyOf, projectsHome } from "./paths.ts"

// Identity sits in the first records written; the current name sits in the last.
const HEAD_BYTES = 64 * 1024
const TAIL_BYTES = 256 * 1024

export interface TranscriptRef {
  key: string
  id: string
  slug: string
  path: string
  mtimeMs: number
  size: number
}

export interface TranscriptIdentity {
  cwd?: string
  gitBranch?: string
  // Best first. Plural because the best candidate can still turn out to be a rendered id.
  names: string[]
}

type Window = "head" | "tail"

function text(value: unknown): string | undefined {
  return typeof value === "string" && !!value.trim() ? value.trim() : undefined
}

function readWindow(path: string, from: Window, bytes: number): { text: string; whole: boolean } | undefined {
  try {
    const fd = openSync(path, "r")
    try {
      const size = fstatSync(fd).size
      const length = Math.min(bytes, size)
      const buffer = Buffer.allocUnsafe(length)
      readSync(fd, buffer, 0, length, from === "head" ? 0 : size - length)
      return { text: buffer.toString("utf8"), whole: length === size }
    } finally {
      closeSync(fd)
    }
  } catch {
    return undefined
  }
}

// The line the window cut in half is not a record; a transcript mid-write also ends in one.
function usableLines(window: { text: string; whole: boolean }, from: Window): string[] {
  const lines = splitLines(window.text)
  if (window.whole) return lines
  return from === "head" ? lines.slice(0, -1) : lines.slice(1)
}

function record(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed[0] !== "{") return undefined
  try {
    const value: unknown = JSON.parse(trimmed)
    return typeof value === "object" && !!value ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function readRecords(path: string, from: Window, bytes: number): Record<string, unknown>[] {
  const window = readWindow(path, from, bytes)
  if (!window) return []
  const out: Record<string, unknown>[] = []
  for (const line of usableLines(window, from)) {
    const parsed = record(line)
    if (parsed) out.push(parsed)
  }
  return out
}

// A sidechain record carries the subagent's own cwd, which is not the session's.
function ownRoot(path: string): { cwd?: string; gitBranch?: string } {
  for (const entry of readRecords(path, "head", HEAD_BYTES)) {
    if (entry.isSidechain === true) continue
    const cwd = text(entry.cwd)
    if (cwd) return { cwd, gitBranch: text(entry.gitBranch) }
  }
  return {}
}

// Every rename appends another title record, so the last one in the file is the one in force.
function latestNames(path: string): string[] {
  let custom: string | undefined
  let agent: string | undefined
  let ai: string | undefined
  for (const entry of readRecords(path, "tail", TAIL_BYTES)) {
    custom = text(entry.customTitle) || custom
    agent = text(entry.agentName) || agent
    ai = text(entry.aiTitle) || ai
  }
  return [custom, agent, ai].filter((name): name is string => !!name)
}

const cache = new Map<string, { size: number; mtimeMs: number; value: TranscriptIdentity }>()

export function identityOf(ref: TranscriptRef): TranscriptIdentity {
  const hit = cache.get(ref.path)
  if (hit && hit.size === ref.size && hit.mtimeMs === ref.mtimeMs) return hit.value
  const value: TranscriptIdentity = { ...ownRoot(ref.path), names: latestNames(ref.path) }
  cache.set(ref.path, { size: ref.size, mtimeMs: ref.mtimeMs, value })
  return value
}

function refOf(slug: string, file: string): TranscriptRef | undefined {
  const id = file.slice(0, -".jsonl".length)
  if (!isSessionId(id)) return undefined
  const path = join(projectsHome(), slug, file)
  try {
    const stat = statSync(path)
    return { key: keyOf(id), id, slug, path, mtimeMs: stat.mtimeMs, size: stat.size }
  } catch {
    return undefined
  }
}

// Subagent transcripts live one level deeper, so a flat read of each project folder skips them.
export function transcriptIndex(): Map<string, TranscriptRef> {
  let slugs: string[]
  try {
    slugs = readdirSync(projectsHome())
  } catch {
    return new Map()
  }
  const byKey = new Map<string, TranscriptRef>()
  for (const slug of slugs) {
    let files: string[]
    try {
      files = readdirSync(join(projectsHome(), slug))
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue
      const ref = refOf(slug, file)
      if (!ref || !isKey(ref.key)) continue
      const seen = byKey.get(ref.key)
      if (!seen || ref.mtimeMs > seen.mtimeMs) byKey.set(ref.key, ref)
    }
  }
  return byKey
}
