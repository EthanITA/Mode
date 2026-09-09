import { open, readdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { ArtifactDetail, ArtifactMeta, ReviewThread, ThreadAnchor, ThreadReply } from "../../shared/types/artifact"

const META_BLOCK = /<!--\s*artifact\b([\s\S]*?)-->/
const TITLE_TAG = /<title>([\s\S]*?)<\/title>/i
const RV_SEED = /<script type="application\/json" id="rv-seed">([\s\S]*?)<\/script>/
// Mirrors BLOCK_RE in skills/mode/bin/_review.py, the one writer of this layer.
const RV_LAYER = /<!-- rv:start -->[\s\S]*?<!-- rv:end -->\n?/
const RV_LAYER_START = /<!-- rv:start -->/
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
  const sel = typeof raw.sel === "string" ? raw.sel : undefined
  const text = typeof raw.text === "string" ? raw.text : undefined
  return label || quote || sel || text ? { label, quote, sel, text } : undefined
}

function toThread(raw: unknown): ReviewThread | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.n !== "number") return undefined
  const replies = Array.isArray(raw.replies) ? raw.replies.map(toReply).filter((r): r is ThreadReply => Boolean(r)) : []
  return {
    id: raw.id,
    n: raw.n,
    by: typeof raw.by === "string" ? raw.by : "user",
    at: typeof raw.at === "string" ? raw.at : "",
    updated: typeof raw.updated === "string" ? raw.updated : undefined,
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

// The review layer sits after the seed and measures ~30 KB, so the window has to clear it.
const TAIL_BYTES = 96 * 1024
// Inline pack CSS puts <body> at a measured p50 of 33 KB, max 45 KB, well past the meta window.
const BODY_BYTES = 64 * 1024
const PREVIEW_CHARS = 220
const BODY_TAG = /<body[^>]*>/i
const NOT_PROSE = /<(script|style|svg|template)[\s\S]*?<\/\1>/gi
const TAGS = /<[^>]+>/g
const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", middot: "·", hellip: "…" }

function previewOf(head: string): string | undefined {
  const at = BODY_TAG.exec(head)
  if (!at) return undefined
  const text = head
    .slice(at.index + at[0].length)
    .replace(NOT_PROSE, " ")
    .replace(TAGS, " ")
    .replace(/&([a-z#0-9]+);/gi, (whole, name: string) => ENTITY[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, " ")
    .trim()
  return text ? text.slice(0, PREVIEW_CHARS) : undefined
}

async function readTail(path: string, size: number): Promise<string> {
  const length = Math.min(TAIL_BYTES, size)
  const handle = await open(path, "r")
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buf, 0, length, size - length)
    return buf.subarray(0, bytesRead).toString("utf8")
  } finally {
    await handle.close()
  }
}

// Undefined rather than 0 when the window missed the seed: no layer and an unread one differ.
function countThreads(tail: string): number | undefined {
  if (!RV_LAYER_START.test(tail)) return undefined
  return RV_SEED.test(tail) ? parseThreads(tail).length : undefined
}

async function artifactFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir)
    return entries.filter((name) => name.endsWith(".html") && !name.endsWith(SRC_SUFFIX)).sort()
  } catch {
    return []
  }
}

// Each row costs 160 KB of reads, so a list that has not changed on disk is answered from here.
const listed = new Map<string, { size: number; mtimeMs: number; meta: ArtifactMeta }>()

async function metaOf(path: string, slug: string, stats: { size: number; mtimeMs: number }): Promise<ArtifactMeta> {
  const hit = listed.get(path)
  if (hit && hit.size === stats.size && hit.mtimeMs === stats.mtimeMs) return hit.meta
  const [head, tail] = await Promise.all([readHead(path, BODY_BYTES), readTail(path, stats.size)])
  const meta: ArtifactMeta = {
    ...parseMeta({ head: head.slice(0, HEAD_BYTES), fallbackSlug: slug, path }),
    threadCount: countThreads(tail),
    preview: previewOf(head),
  }
  listed.set(path, { size: stats.size, mtimeMs: stats.mtimeMs, meta })
  return meta
}

export async function listArtifacts(): Promise<ArtifactMeta[]> {
  const dir = await artifactsDir()
  const rows: { meta: ArtifactMeta; mtime: number }[] = []
  for (const name of await artifactFiles(dir)) {
    const path = join(dir, name)
    try {
      const stats = await stat(path)
      rows.push({ meta: await metaOf(path, name.replace(/\.html$/, ""), stats), mtime: stats.mtimeMs })
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

export async function writeArtifactHtml(slug: string, html: string): Promise<boolean> {
  const path = await artifactPath(slug)
  if (!path) return false
  await writeFile(path, html, "utf8")
  listed.delete(path)
  return true
}

const BLOCK_TAGS = new Set(["blockquote", "figure", "h1", "h2", "h3", "h4", "li", "p", "pre", "table"])
const SKIP_TAGS = new Set(["script", "style", "svg", "template"])

interface TextAtom {
  ch: string
  from: number
  to: number
}

interface BlockSpan {
  from: number
  innerFrom: number
  innerTo: number
  nested: boolean
  to: number
}

export type ArtifactEditFail = "ambiguous" | "invalid" | "not-found"

export type ArtifactEditOutcome =
  | { html: string; id?: string; ok: true }
  | { ok: false; reason: ArtifactEditFail }

function decodeEntity(raw: string): string {
  if (raw[0] === "#") {
    const hex = raw[1] === "x" || raw[1] === "X"
    const n = Number.parseInt(raw.slice(hex ? 2 : 1), hex ? 16 : 10)
    return Number.isFinite(n) && n ? String.fromCodePoint(n) : `&${raw};`
  }
  return ENTITY[raw.toLowerCase()] ?? `&${raw};`
}

function atomsIn(html: string, from: number, to: number): TextAtom[] {
  const out: TextAtom[] = []
  let i = from
  let skip = 0
  while (i < to) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4)
      i = end < 0 ? to : end + 3
      continue
    }
    if (html[i] === "<") {
      const gt = html.indexOf(">", i)
      if (gt < 0 || gt >= to) break
      const close = html[i + 1] === "/"
      const name = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(i, gt + 1))?.[1]?.toLowerCase()
      if (name && SKIP_TAGS.has(name)) skip += close ? -1 : 1
      if (skip < 0) skip = 0
      i = gt + 1
      continue
    }
    if (skip) {
      i += 1
      continue
    }
    if (html[i] === "&") {
      const semi = html.indexOf(";", i + 1)
      if (semi > i && semi < i + 12 && semi < to) {
        out.push({ ch: decodeEntity(html.slice(i + 1, semi)), from: i, to: semi + 1 })
        i = semi + 1
        continue
      }
    }
    out.push({ ch: html[i] ?? "", from: i, to: i + 1 })
    i += 1
  }
  return out
}

function folded(atoms: TextAtom[]): { at: number[]; text: string } {
  const chars: string[] = []
  const at: number[] = []
  let pending = false
  let started = false
  for (let i = 0; i < atoms.length; i++) {
    const ch = atoms[i]?.ch ?? ""
    if (!ch) continue
    if (/\s/.test(ch)) {
      if (started) pending = true
      continue
    }
    if (pending) {
      chars.push(" ")
      at.push(at.at(-1) ?? i)
      pending = false
    }
    chars.push(ch)
    at.push(i)
    started = true
  }
  return { at, text: chars.join("") }
}

function bodyBounds(html: string): { from: number; to: number } {
  const open = /<body\b[^>]*>/i.exec(html)
  const close = html.search(/<\/body>/i)
  if (!open || close < 0) return { from: 0, to: html.length }
  return { from: open.index + open[0].length, to: close }
}

function leafBlocks(html: string, from: number, to: number): BlockSpan[] {
  const stack: { from: number; innerFrom: number; nested: boolean; tag: string }[] = []
  const done: BlockSpan[] = []
  let i = from
  while (i < to) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4)
      i = end < 0 ? to : end + 3
      continue
    }
    if (html[i] !== "<") {
      i += 1
      continue
    }
    const gt = html.indexOf(">", i)
    if (gt < 0 || gt >= to) break
    const token = html.slice(i, gt + 1)
    const close = token.startsWith("</")
    const name = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(token)?.[1]?.toLowerCase()
    if (!name || !BLOCK_TAGS.has(name)) {
      i = gt + 1
      continue
    }
    if (close) {
      for (let s = stack.length - 1; s >= 0; s--) {
        const held = stack[s]
        if (held?.tag !== name) continue
        done.push({ from: held.from, innerFrom: held.innerFrom, innerTo: i, nested: held.nested, to: gt + 1 })
        stack.length = s
        break
      }
      i = gt + 1
      continue
    }
    if (token.endsWith("/>")) {
      i = gt + 1
      continue
    }
    for (const held of stack) held.nested = true
    stack.push({ from: i, innerFrom: gt + 1, nested: false, tag: name })
    i = gt + 1
  }
  return done.filter((block) => !block.nested)
}

function pageOf(html: string): { page: string; tail: string } {
  const at = html.search(RV_LAYER_START)
  if (at < 0) return { page: html, tail: "" }
  return { page: html.slice(0, at), tail: html.slice(at) }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function hitsIn(html: string, from: number, to: number, needle: string): { from: number; to: number }[] {
  if (!needle) return []
  const atoms = atomsIn(html, from, to)
  const { at, text } = folded(atoms)
  const hits: { from: number; to: number }[] = []
  let cursor = 0
  while (cursor < text.length) {
    const atNorm = text.indexOf(needle, cursor)
    if (atNorm < 0) break
    const first = at[atNorm]
    const last = at[atNorm + needle.length - 1]
    const startAtom = typeof first === "number" ? atoms[first] : undefined
    const endAtom = typeof last === "number" ? atoms[last] : undefined
    if (startAtom && endAtom) hits.push({ from: startAtom.from, to: endAtom.to })
    cursor = atNorm + 1
  }
  return hits
}

function matchingBlocks(html: string, from: number, to: number, block: string): BlockSpan[] {
  const leaves = leafBlocks(html, from, to)
  const exact = leaves.filter((leaf) => folded(atomsIn(html, leaf.innerFrom, leaf.innerTo)).text === block)
  return exact.length ? exact : leaves.filter((leaf) => folded(atomsIn(html, leaf.innerFrom, leaf.innerTo)).text.includes(block))
}

export function applyArtifactEdit(input: { block?: string; html: string; replacement: string; selection: string }): ArtifactEditOutcome {
  const selection = input.selection.replace(/\s+/g, " ").trim()
  if (!selection || !input.replacement) return { ok: false, reason: "invalid" }
  const { page, tail } = pageOf(input.html)
  const bounds = bodyBounds(page)
  const hits = input.block
    ? matchingBlocks(page, bounds.from, bounds.to, input.block.replace(/\s+/g, " ").trim()).flatMap((leaf) =>
        hitsIn(page, leaf.innerFrom, leaf.innerTo, selection),
      )
    : hitsIn(page, bounds.from, bounds.to, selection)
  if (!hits.length) return { ok: false, reason: "not-found" }
  if (hits.length > 1) return { ok: false, reason: "ambiguous" }
  const [hit] = hits
  if (!hit) return { ok: false, reason: "not-found" }
  const slice = page.slice(hit.from, hit.to)
  // A wrap that swallowed a tag would leave the artifact unparseable as standalone HTML.
  if (slice.includes("<")) return { ok: false, reason: "not-found" }
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12)
  const wrapped = `<del data-sc-edit="${id}">${slice}</del><ins data-sc-edit="${id}">${escapeHtml(input.replacement)}</ins>`
  return { html: `${page.slice(0, hit.from)}${wrapped}${page.slice(hit.to)}${tail}`, id, ok: true }
}

const PAIR = /<del data-sc-edit="([^"]+)">([\s\S]*?)<\/del><ins data-sc-edit="\1">([\s\S]*?)<\/ins>/g

function parseSeed(html: string): Record<string, unknown> | undefined {
  const captured = RV_SEED.exec(html)?.[1]
  if (!captured) return undefined
  try {
    const doc = JSON.parse(captured) as unknown
    return isRecord(doc) ? doc : undefined
  } catch {
    return undefined
  }
}

function writeSeed(html: string, seed: Record<string, unknown>): string {
  const json = JSON.stringify(seed).replace(/</g, "\\u003c")
  if (!RV_SEED.test(html)) return html
  return html.replace(RV_SEED, `<script type="application/json" id="rv-seed">${json}</script>`)
}

function nowIso(): string {
  return new Date().toISOString()
}

function uid8(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
}

export type ArtifactReviewFail = "invalid" | "not-found" | "no-seed"

export type ArtifactReviewOutcome =
  | { ok: true; html: string; thread?: ReviewThread; threads: ReviewThread[] }
  | { ok: false; reason: ArtifactReviewFail }

export function applyReviewChange(input: {
  action: "create" | "reply" | "resolve"
  anchor?: ThreadAnchor
  body?: string
  by?: string
  html: string
  id?: string
}): ArtifactReviewOutcome {
  const seed = parseSeed(input.html)
  if (!seed) return { ok: false, reason: "no-seed" }
  const threads = Array.isArray(seed.threads)
    ? seed.threads.map(toThread).filter((t): t is ReviewThread => Boolean(t))
    : []

  if (input.action === "create") {
    const body = input.body?.trim()
    if (!body) return { ok: false, reason: "invalid" }
    const thread: ReviewThread = {
      id: uid8(),
      n: threads.reduce((max, one) => Math.max(max, one.n), 0) + 1,
      by: "user",
      at: nowIso(),
      updated: nowIso(),
      body,
      status: "open",
      anchor: input.anchor,
      replies: [],
    }
    const next = [...threads, thread]
    return {
      ok: true,
      html: writeSeed(input.html, { ...seed, threads: next }),
      thread,
      threads: next,
    }
  }

  if (!input.id) return { ok: false, reason: "invalid" }
  const at = threads.findIndex((one) => one.id === input.id)
  const held = threads[at]
  if (at < 0 || !held) return { ok: false, reason: "not-found" }

  if (input.action === "resolve") {
    const thread: ReviewThread = { ...held, status: "resolved", updated: nowIso() }
    const next = threads.map((one, i) => (i === at ? thread : one))
    return { ok: true, html: writeSeed(input.html, { ...seed, threads: next }), thread, threads: next }
  }

  const body = input.body?.trim()
  if (!body) return { ok: false, reason: "invalid" }
  const reply: ThreadReply = { id: uid8(), by: input.by || "user", at: nowIso(), body }
  const thread: ReviewThread = {
    ...held,
    updated: nowIso(),
    replies: [...held.replies, reply],
  }
  const next = threads.map((one, i) => (i === at ? thread : one))
  return { ok: true, html: writeSeed(input.html, { ...seed, threads: next }), thread, threads: next }
}

export function resolveArtifactEdit(input: { action: "accept" | "revert"; html: string; selection: string }): ArtifactEditOutcome {
  const selection = input.selection.replace(/\s+/g, " ").trim()
  if (!selection) return { ok: false, reason: "invalid" }
  const { page, tail } = pageOf(input.html)
  const found: { from: number; next: string; old: string; to: number }[] = []
  for (const match of page.matchAll(PAIR)) {
    if (typeof match.index !== "number") continue
    const old = match[2] ?? ""
    const next = match[3] ?? ""
    const oldText = folded(atomsIn(old, 0, old.length)).text
    if (old === selection || oldText === selection) {
      found.push({ from: match.index, next, old, to: match.index + match[0].length })
    }
  }
  if (!found.length) return { ok: false, reason: "not-found" }
  if (found.length > 1) return { ok: false, reason: "ambiguous" }
  const [pair] = found
  if (!pair) return { ok: false, reason: "not-found" }
  const kept = input.action === "accept" ? pair.next : pair.old
  return { html: `${page.slice(0, pair.from)}${kept}${page.slice(pair.to)}${tail}`, ok: true }
}
