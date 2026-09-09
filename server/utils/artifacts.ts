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

const SKIP_TAGS = new Set(["script", "style", "svg", "template"])
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"])
const RAW_TAGS = new Set(["script", "style", "svg", "template", "textarea", "title"])

interface TextAtom {
  ch: string
  from: number
  to: number
}

export type ArtifactEditFail = "ambiguous" | "invalid" | "not-found" | "stale"

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

function pageOf(html: string): { page: string; tail: string } {
  const at = html.search(RV_LAYER_START)
  if (at < 0) return { page: html, tail: "" }
  return { page: html.slice(0, at), tail: html.slice(at) }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

interface El {
  tag: string
  id?: string
  edit?: string
  parent?: El
  children: El[]
  innerFrom: number
  innerTo: number
}

function attrOf(token: string, name: string): string | undefined {
  const re = new RegExp(`(?:\\s|^)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  const hit = re.exec(token.slice(1))
  return hit?.[1] || hit?.[2] || hit?.[3] || undefined
}

function parseTree(html: string): El {
  const root: El = { tag: "#document", children: [], innerFrom: 0, innerTo: html.length }
  const stack: El[] = [root]
  let i = 0
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4)
      i = end < 0 ? html.length : end + 3
      continue
    }
    if (html[i] !== "<") {
      i += 1
      continue
    }
    const gt = html.indexOf(">", i)
    if (gt < 0) break
    const token = html.slice(i, gt + 1)
    if (token.startsWith("<!") || token.startsWith("<?")) {
      i = gt + 1
      continue
    }
    const name = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(token)?.[1]?.toLowerCase()
    if (!name) {
      i = gt + 1
      continue
    }
    if (token.startsWith("</")) {
      for (let s = stack.length - 1; s >= 1; s--) {
        const held = stack[s]
        if (held?.tag !== name) continue
        held.innerTo = i
        stack.length = s
        break
      }
      i = gt + 1
      continue
    }
    const parent = stack[stack.length - 1] ?? root
    const node: El = {
      tag: name,
      id: attrOf(token, "id") || undefined,
      edit: attrOf(token, "data-sc-edit") || undefined,
      parent,
      children: [],
      innerFrom: gt + 1,
      innerTo: gt + 1,
    }
    parent.children.push(node)
    i = gt + 1
    if (token.endsWith("/>") || VOID_TAGS.has(name)) continue
    if (RAW_TAGS.has(name)) {
      const closeAt = html.toLowerCase().indexOf(`</${name}`, i)
      if (closeAt < 0) {
        node.innerTo = html.length
        i = html.length
        continue
      }
      node.innerTo = closeAt
      const closeGt = html.indexOf(">", closeAt)
      i = closeGt < 0 ? html.length : closeGt + 1
      continue
    }
    stack.push(node)
  }
  while (stack.length > 1) {
    const held = stack.pop()
    if (held) held.innerTo = html.length
  }
  return root
}

interface PathStep {
  id?: string
  tag?: string
  nth?: number
}

function unescapeCss(raw: string): string {
  return raw.replace(/\\(.)/g, "$1")
}

function stepsOf(path: string): PathStep[] | undefined {
  const steps: PathStep[] = []
  for (const part of path.trim().split(" > ")) {
    if (part.startsWith("#")) {
      const id = unescapeCss(part.slice(1))
      if (!id) return undefined
      steps.push({ id })
      continue
    }
    const hit = /^([a-zA-Z][a-zA-Z0-9]*)(?::nth-of-type\((\d+)\))?$/.exec(part)
    if (!hit?.[1]) return undefined
    const nth = hit[2] ? Number.parseInt(hit[2], 10) : 0
    steps.push({ tag: hit[1].toLowerCase(), nth: nth || undefined })
  }
  return steps.length ? steps : undefined
}

function matchStep(el: El, step: PathStep): boolean {
  if (step.id) return el.id === step.id
  if (step.tag && el.tag !== step.tag) return false
  if (!step.nth) return true
  const kin = (el.parent?.children ?? []).filter((child) => child.tag === el.tag)
  return kin.indexOf(el) + 1 === step.nth
}

function descendantsOf(el: El): El[] {
  return el.children.flatMap((child) => [child, ...descendantsOf(child)])
}

function queryPath(root: El, path: string): El[] {
  const steps = stepsOf(path)
  if (!steps) return []
  const [first, ...rest] = steps
  if (!first) return []
  let cur = descendantsOf(root).filter((el) => matchStep(el, first))
  for (const step of rest) {
    cur = cur.flatMap((el) => el.children.filter((child) => matchStep(child, step)))
  }
  return cur
}

function locatePath(root: El, path: string): { el: El } | { reason: ArtifactEditFail } {
  const all = queryPath(root, path)
  if (all.length > 1) return { reason: "ambiguous" }
  const [el] = all
  return el ? { el } : { reason: "not-found" }
}

export function applyArtifactEdit(input: { html: string; path: string; replacement: string; selection: string }): ArtifactEditOutcome {
  const path = input.path.trim()
  const guard = input.selection.replace(/\s+/g, " ").trim()
  if (!path || !guard || !input.replacement) return { ok: false, reason: "invalid" }
  const { page, tail } = pageOf(input.html)
  const found = locatePath(parseTree(page), path)
  if (!("el" in found)) return { ok: false, reason: found.reason }
  if (folded(atomsIn(page, found.el.innerFrom, found.el.innerTo)).text !== guard) return { ok: false, reason: "stale" }
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12)
  const prev = page.slice(found.el.innerFrom, found.el.innerTo)
  const wrapped = `<del data-sc-edit="${id}">${prev}</del><ins data-sc-edit="${id}">${escapeHtml(input.replacement)}</ins>`
  return { html: `${page.slice(0, found.el.innerFrom)}${wrapped}${page.slice(found.el.innerTo)}${tail}`, id, ok: true }
}

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

export function resolveArtifactEdit(input: { action: "accept" | "revert"; html: string; id: string; path: string }): ArtifactEditOutcome {
  const path = input.path.trim()
  const id = input.id.trim()
  if (!path || !id) return { ok: false, reason: "invalid" }
  const { page, tail } = pageOf(input.html)
  const found = locatePath(parseTree(page), path)
  if (!("el" in found)) return { ok: false, reason: found.reason }
  const inside = descendantsOf(found.el)
  const del = inside.find((el) => el.tag === "del" && el.edit === id)
  const ins = inside.find((el) => el.tag === "ins" && el.edit === id)
  if (!del || !ins) return { ok: false, reason: "not-found" }
  const kept = input.action === "accept" ? page.slice(ins.innerFrom, ins.innerTo) : page.slice(del.innerFrom, del.innerTo)
  return { html: `${page.slice(0, found.el.innerFrom)}${kept}${page.slice(found.el.innerTo)}${tail}`, ok: true }
}
