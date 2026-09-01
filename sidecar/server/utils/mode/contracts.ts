import { join } from "node:path"
import { AUTO, type Axis, FALSEY } from "./constants.ts"
import { splitFrontMatter } from "./frontmatter.ts"
import { isFile, listMd, readTextSafe } from "./fsutil.ts"
import { contractDirs } from "./paths.ts"

export function names(axis: Axis): string[] {
  const found = new Set<string>()
  for (const dir of contractDirs(axis)) for (const f of listMd(dir)) found.add(f.slice(0, -3))
  return [...found].sort()
}

export function contractFile(axis: Axis, name: string): string | undefined {
  for (const dir of [...contractDirs(axis)].reverse()) {
    const p = join(dir, `${name}.md`)
    if (isFile(p)) return p
  }
  return undefined
}

export function readContract(axis: Axis, name: string): { meta: Record<string, string>; body: string } {
  const path = name && name !== AUTO ? contractFile(axis, name) : undefined
  const text = readTextSafe(path)
  return text ? splitFrontMatter(text) : { meta: {}, body: "" }
}

export function metaOf(axis: Axis, name: string): Record<string, string> {
  return readContract(axis, name).meta
}

export function truthy(meta: Record<string, string>, key: string): boolean {
  const value = (meta[key] || "").trim().replace(/^["']+|["']+$/g, "").toLowerCase()
  return Boolean(value) && !FALSEY.has(value)
}

export function alternatives(meta: Record<string, string>, key: string): string[] {
  return (meta[key] || "").split("|").map((p) => p.trim().toLowerCase()).filter(Boolean)
}

export type PipelineStep = { label: string; gate: boolean; event: string }

export function pipelineSteps(axis: Axis, name: string): PipelineStep[] {
  const raw = metaOf(axis, name).steps || ""
  const out: PipelineStep[] = []
  for (const token of raw.split(",")) {
    const at = token.trim().indexOf("@")
    const rawLabel = (at < 0 ? token.trim() : token.trim().slice(0, at)).trim()
    const event = (at < 0 ? "" : token.trim().slice(at + 1)).trim().toLowerCase()
    const label = rawLabel.replace(/\?+$/, "")
    if (!label) continue
    out.push({ label, gate: rawLabel.endsWith("?"), event })
  }
  return out
}

export type ContractLoop = { from: string; to: string }

// A loop naming a step that no longer exists drops the arc rather than the whole drawing, same as
// bin/mode's arcs().
export function pipelineLoops(axis: Axis, name: string, steps: PipelineStep[]): ContractLoop[] {
  const labels = new Set(steps.map((s) => s.label.toLowerCase()))
  const raw = metaOf(axis, name).loops || ""
  const out: ContractLoop[] = []
  for (const pair of raw.split(",")) {
    const arrow = pair.indexOf(">")
    if (arrow < 0) continue
    const from = pair.slice(0, arrow).trim().toLowerCase()
    const to = pair.slice(arrow + 1).trim().toLowerCase()
    if (labels.has(from) && labels.has(to)) out.push({ from, to })
  }
  return out
}
