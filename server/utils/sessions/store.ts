import type { BaselineOrigin } from "../../../shared/types/versions.ts"
import { applyEdit, type FileEdit, type FileTouch, type ParsedTurn } from "./receipts.ts"

export const MAX_FILE_BYTES = 512 * 1024
export const MAX_STORE_BYTES = 64 * 1024 * 1024

export type { BaselineOrigin } from "../../../shared/types/versions.ts"

export interface FileState {
  path: string
  by: string
  content?: string
}

export interface TurnPlan {
  turn: number
  at: number
  by: string
  prompt?: string
  baselines: FileState[]
  files: FileState[]
}

export interface StorePlan {
  plans: TurnPlan[]
  skipped: Map<string, string>
  baselines: Map<string, BaselineOrigin>
  capped?: boolean
}

export function planOf(turns: ParsedTurn[]): StorePlan {
  const chains = new Map<string, FileTouch[]>()
  for (const turn of turns) {
    for (const touch of turn.touches) {
      const chain = chains.get(touch.path)
      if (chain) chain.push(touch)
      else chains.set(touch.path, [touch])
    }
  }
  const skipped = new Map<string, string>()
  const baselines = new Map<string, BaselineOrigin>()
  const known = new Map<string, string | undefined>()
  const seen = new Set<string>()
  const plans: TurnPlan[] = []
  let bytes = 0
  let capped = false

  for (const turn of turns) {
    const plan: TurnPlan = { turn: turn.receipt.turn, at: turn.receipt.at, by: byOf(turn), prompt: turn.receipt.prompt, baselines: [], files: [] }
    for (const [path, group] of groupByPath(turn.touches)) {
      if (skipped.has(path)) continue
      if (!seen.has(path)) {
        seen.add(path)
        const start = baselineOf(chains.get(path) || group)
        baselines.set(path, start.source)
        known.set(path, start.content)
        if (typeof start.content === "string") plan.baselines.push({ path, by: group[0]!.by, content: start.content })
      }
      let content = known.get(path)
      for (const touch of group) content = advance(content, touch)
      if (typeof content === "string" && Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
        skipped.set(path, `over ${MAX_FILE_BYTES} bytes`)
        continue
      }
      if (bytes > MAX_STORE_BYTES) {
        capped = true
        skipped.set(path, "store size budget reached")
        continue
      }
      bytes += content ? Buffer.byteLength(content, "utf8") : 0
      known.set(path, content)
      plan.files.push({ path, by: group[group.length - 1]!.by, content })
    }
    plans.push(plan)
  }
  return { plans, skipped, baselines, capped: capped || undefined }
}

// `prior` is what the tool read off disk at that moment, so it outranks anything carried forward.
function advance(content: string | undefined, touch: FileTouch): string | undefined {
  if (touch.kind === "delete") return undefined
  const pre = typeof touch.prior === "string" ? touch.prior : touch.created ? "" : content
  if (touch.kind === "write") return typeof touch.content === "string" ? touch.content : pre
  if (!touch.edit || typeof pre !== "string") return pre
  return applyEdit(pre, touch.edit) ?? pre
}

function baselineOf(chain: FileTouch[]): { content?: string; source: BaselineOrigin } {
  const first = chain[0]
  if (!first) return { source: "unknown" }
  if (typeof first.prior === "string") return { content: first.prior, source: "exact" }
  if (first.created) return { source: "absent" }
  const derived = deriveBackwards(chain)
  return typeof derived === "string" ? { content: derived, source: "reconstructed" } : { source: "unknown" }
}

// Rare, not dead: 16 of 1,791 files were eligible, all 16 failed these checks.
// Disk is never the anchor, so a restore cannot move a baseline.
function deriveBackwards(chain: FileTouch[]): string | undefined {
  for (let i = chain.length - 1; i >= 0; i--) {
    const touch = chain[i]!
    if (touch.kind === "delete") return undefined
    if (typeof touch.prior === "string") return unwind(chain.slice(0, i), touch.prior)
    if (touch.kind === "write") return touch.created ? unwind(chain.slice(0, i), "") : undefined
  }
  return undefined
}

function unwind(chain: FileTouch[], from: string): string | undefined {
  let content = from
  for (let i = chain.length - 1; i >= 0; i--) {
    const touch = chain[i]!
    if (touch.kind !== "edit" || !touch.edit) return undefined
    const back = invertEdit(content, touch.edit)
    if (typeof back !== "string") return undefined
    content = back
  }
  return content
}

// Not applyEdit reversed: a replaceAll inversion over-applies where the old text already occurred.
export function invertEdit(content: string, edit: FileEdit): string | undefined {
  if (!edit.new) return undefined
  const at = content.indexOf(edit.new)
  if (at < 0) return undefined
  if (edit.all && content.indexOf(edit.new, at + edit.new.length) >= 0) return undefined
  return content.slice(0, at) + edit.old + content.slice(at + edit.new.length)
}

function groupByPath(touches: FileTouch[]): Map<string, FileTouch[]> {
  const out = new Map<string, FileTouch[]>()
  for (const touch of touches) {
    const group = out.get(touch.path)
    if (group) group.push(touch)
    else out.set(touch.path, [touch])
  }
  return out
}

function byOf(turn: ParsedTurn): string {
  const [first] = turn.receipt.by || []
  return first || ""
}

// Absolute paths cannot be committed as-is, and a leading slash would escape the worktree.
export function storePath(path: string): string {
  return path.replace(/^\/+/, "").replace(/^([a-zA-Z]):[\\/]/, "$1/")
}
