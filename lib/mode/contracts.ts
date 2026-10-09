import { join } from "node:path"
import type { Axis, PipelineStep } from "../../shared/types/mode.ts"
import { isFile, listMd, readTextSafe } from "../files.ts"
import { strip, WORD } from "../text.ts"
import { AUTO, FALSEY, FOLDER } from "./constants.ts"
import { splitFrontMatter, type Meta } from "./frontmatter.ts"
import { contractDirs } from "./paths.ts"

const DEFAULT_USER = "the user"
const USER_TOKEN = "{{USER}}"

export function names(axis: Axis): string[] {
  const found = new Set<string>()
  for (const dir of contractDirs(axis)) for (const file of listMd(dir)) found.add(file.slice(0, -3))
  return [...found].sort()
}

export function contractFile(axis: Axis, name: string): string | undefined {
  for (const dir of [...contractDirs(axis)].reverse()) {
    const path = join(dir, `${name}.md`)
    if (isFile(path)) return path
  }
  return undefined
}

export function available(axis: Axis): string {
  const found = names(axis)
  if (!found.length) return `no ${FOLDER[axis]} in ${contractDirs(axis).join(" or ")}`
  return `available ${FOLDER[axis]}:\n  ${found.join("\n  ")}`
}

export function readContract(axis: Axis, name: string): { meta: Meta; body: string } {
  const path = name && name !== AUTO ? contractFile(axis, name) : undefined
  const text = readTextSafe(path)
  return text ? splitFrontMatter(text) : { meta: {}, body: "" }
}

export function metaOf(axis: Axis, name: string): Meta {
  return readContract(axis, name).meta
}

export function summary(axis: Axis, name: string): string {
  return metaOf(axis, name).summary ?? ""
}

// Pipe-separated, lowercased so matching ignores case on both sides.
export function alternatives(meta: Meta, key: string): string[] {
  return (meta[key] ?? "").split("|").map((part) => strip(part).toLowerCase()).filter(Boolean)
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

// Leading edge only: `build the` must miss `rebuild the`, while `fail` still catches `failures`.
export function hits(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    const edge = new RegExp(`^${WORD}`, "u").test(phrase) ? `(?<!${WORD})` : `(?<=${WORD})`
    return new RegExp(edge + escape(phrase), "u").test(text)
  })
}

// Nobody writes an opt-in restriction meaning to leave it off, so only an explicit no reads as off.
export function truthy(meta: Meta, key: string): boolean {
  const value = strip(meta[key] ?? "").replace(/^["']+|["']+$/g, "").toLowerCase()
  return !!value && !FALSEY.has(value)
}

export function neverAuto(meta: Meta): boolean {
  return truthy(meta, "enter-never")
}

// Compatibility only: a user-authored contract from before 0.8.0 may still carry the token.
export function substitute(text: string): string {
  return text.replaceAll(USER_TOKEN, DEFAULT_USER)
}

export function steps(axis: Axis, name: string): PipelineStep[] {
  const out: PipelineStep[] = []
  for (const token of (metaOf(axis, name).steps ?? "").split(",")) {
    const at = token.indexOf("@")
    const raw = strip(at < 0 ? token : token.slice(0, at))
    const label = raw.replace(/\?+$/, "")
    if (!label) continue
    out.push({ label, gate: raw.endsWith("?"), event: strip(at < 0 ? "" : token.slice(at + 1)).toLowerCase() })
  }
  return out
}

// A loop naming a step that no longer exists drops its arc rather than the whole drawing.
export function arcs(axis: Axis, name: string, drawn: PipelineStep[]): [number, number][] {
  const where = new Map(drawn.map((step, i) => [step.label.toLowerCase(), i]))
  const out: [number, number][] = []
  for (const pair of (metaOf(axis, name).loops ?? "").split(",")) {
    const arrow = pair.indexOf(">")
    if (arrow < 0) continue
    const from = strip(pair.slice(0, arrow)).toLowerCase()
    const to = strip(pair.slice(arrow + 1)).toLowerCase()
    if (where.has(from) && where.has(to)) out.push([where.get(from) ?? 0, where.get(to) ?? 0])
  }
  return out
}
