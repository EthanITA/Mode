import { open, readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { ArtifactDetail, ArtifactMeta, ReviewThread, ThreadAnchor, ThreadReply } from "../../shared/types/artifact"

const META_BLOCK = /<!--\s*artifact\b([\s\S]*?)-->/
const TITLE_TAG = /<title>([\s\S]*?)<\/title>/i
const RV_SEED = /<script type="application\/json" id="rv-seed">([\s\S]*?)<\/script>/
// Mirrors BLOCK_RE in skills/mode/bin/_review.py, the one writer of this layer.
const RV_LAYER = /<!-- rv:start -->[\s\S]*?<!-- rv:end -->\n?/
type MetaField = "slug" | "title" | "url" | "target" | "ds" | "updated"
const META_FIELDS = new Set<MetaField>(["slug", "title", "url", "target", "ds", "updated"])
const HEAD_BYTES = 4000
// Slug becomes a filename on disk; reject anything that could climb out of the artifacts dir.
const SAFE_SLUG = /^[a-zA-Z0-9._-]+$/
// A pre-build source, never an artifact. One constant, so listing and direct access cannot diverge.
const SRC_SUFFIX = ".src.html"

function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path
}

async function configuredDir(): Promise<string | undefined> {
  const configHome = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")
  try {
    const raw = await readFile(join(configHome, "mode", "config.json"), "utf8")
    const parsed = JSON.parse(raw) as { artifacts?: unknown }
    return typeof parsed.artifacts === "string" && parsed.artifacts ? parsed.artifacts : undefined
  } catch {
    return undefined
  }
}

export async function artifactsDir(): Promise<string> {
  if (process.env.NOTES_ARTIFACTS) return expandHome(process.env.NOTES_ARTIFACTS)
  return expandHome((await configuredDir()) || join(homedir(), "artifacts"))
}

// The list route touches every file in the dir, so a partial fd read beats loading each one whole.
async function readHead(path: string, bytes: number = HEAD_BYTES): Promise<string> {
  const handle = await open(path, "r")
  try {
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = await handle.read(buf, 0, bytes, 0)
    return buf.subarray(0, bytesRead).toString("utf8")
  } finally {
    await handle.close()
  }
}

interface ParseMetaInput {
  head: string
  fallbackSlug: string
  path: string
}

function parseMeta({ head, fallbackSlug, path }: ParseMetaInput): ArtifactMeta {
  const fields: Partial<Record<MetaField, string>> = {}
  const block = META_BLOCK.exec(head)?.[1]
  if (block) {
    for (const line of block.split("\n")) {
      const i = line.indexOf(":")
      if (i === -1) continue
      const key = line.slice(0, i).trim().toLowerCase() as MetaField
      if (META_FIELDS.has(key)) fields[key] = line.slice(i + 1).trim()
    }
  }
  const title = fields.title || TITLE_TAG.exec(head)?.[1]?.trim() || ""
  // A local showpiece owns its own doctype; a published one never does. Mirrors bin/artifact's read_meta.
  const target = fields.target || (/^\s*<!doctype/i.test(head) ? "s" : "b")
  return { slug: fields.slug || fallbackSlug, title, url: fields.url, target, ds: fields.ds, updated: fields.updated, path }
}

// external contract: validating the shape of raw JSON.parse output read off disk
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && !!x
}

function toReply(raw: unknown): ThreadReply | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.body !== "string") return undefined
  return { id: raw.id, by: typeof raw.by === "string" ? raw.by : "user", at: typeof raw.at === "string" ? raw.at : "", body: raw.body }
}

function toAnchor(raw: unknown): ThreadAnchor | undefined {
  if (!isRecord(raw)) return undefined
  const label = typeof raw.label === "string" ? raw.label : undefined
  const quote = typeof raw.quote === "string" ? raw.quote : undefined
  return label || quote ? { label, quote } : undefined
}

function toThread(raw: unknown): ReviewThread | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.n !== "number") return undefined
  const replies = Array.isArray(raw.replies) ? raw.replies.map(toReply).filter((r): r is ThreadReply => Boolean(r)) : []
  return {
    id: raw.id,
    n: raw.n,
    by: typeof raw.by === "string" ? raw.by : "user",
    at: typeof raw.at === "string" ? raw.at : "",
    body: typeof raw.body === "string" ? raw.body : "",
    status: raw.status === "resolved" ? "resolved" : "open",
    anchor: toAnchor(raw.anchor),
    replies,
  }
}

function parseThreads(html: string): ReviewThread[] {
  const captured = RV_SEED.exec(html)?.[1]
  if (!captured) return []
  let doc: unknown
  try {
    doc = JSON.parse(captured)
  } catch {
    return [] // a half-written seed block reads as no threads rather than crashing the route
  }
  const threads = isRecord(doc) ? doc.threads : undefined
  return Array.isArray(threads) ? threads.map(toThread).filter((t): t is ReviewThread => Boolean(t)) : []
}

async function artifactFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir)
    return entries.filter((name) => name.endsWith(".html") && !name.endsWith(SRC_SUFFIX)).sort()
  } catch {
    return []
  }
}

export async function listArtifacts(): Promise<ArtifactMeta[]> {
  const dir = await artifactsDir()
  const rows: { meta: ArtifactMeta; mtime: number }[] = []
  for (const name of await artifactFiles(dir)) {
    const path = join(dir, name)
    try {
      const [head, stats] = await Promise.all([readHead(path), stat(path)])
      rows.push({ meta: parseMeta({ head, fallbackSlug: name.replace(/\.html$/, ""), path }), mtime: stats.mtimeMs })
    } catch {
      // vanished or unreadable between the readdir and the read: drop it rather than fail the whole list
    }
  }
  return rows.sort((a, b) => b.mtime - a.mtime).map((r) => r.meta)
}

export async function artifactPath(slug: string): Promise<string | undefined> {
  if (!SAFE_SLUG.test(slug)) return undefined
  const name = `${slug}.html`
  if (name.endsWith(SRC_SUFFIX)) return undefined
  return join(await artifactsDir(), name)
}

async function readWhole(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return undefined
  }
}

export async function readArtifactHtml(slug: string): Promise<string | undefined> {
  const path = await artifactPath(slug)
  return path ? readWhole(path) : undefined
}

/** The sidecar draws the notes in its own gutter, so the page's own comment surface would be a second one. */
export function stripReviewLayer(html: string): string {
  return html.replace(RV_LAYER, "")
}

export async function getArtifact(slug: string): Promise<ArtifactDetail | undefined> {
  const path = await artifactPath(slug)
  const html = path ? await readWhole(path) : undefined
  if (!path || !html) return undefined
  return { ...parseMeta({ head: html.slice(0, HEAD_BYTES), fallbackSlug: slug, path }), threads: parseThreads(html) }
}
