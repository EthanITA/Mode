import { readdirSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import type { ReceiptCommand, ReceiptsSlice, TurnReceipt } from "../../../shared/types/receipts.ts"
import { readTextSafe } from "../mode/fsutil.ts"
import { projectsHome } from "./paths.ts"
import { readWindow, transcriptIndex, usableLines, type TranscriptRef } from "./transcripts.ts"

const PROMPT_CHARS = 400
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g
const COMMAND = /<command-name>([\s\S]*?)<\/command-name>|<command-args>([\s\S]*?)<\/command-args>/g
const NOISE = /^(<local-command-(stdout|stderr)>|\[Request interrupted by user)/

export interface FileEdit {
  old: string
  new: string
  all?: boolean
}

export interface FileTouch {
  path: string
  kind: "write" | "edit" | "delete"
  by: string
  at: number
  prior?: string
  content?: string
  edit?: FileEdit
  created?: boolean
}

export interface ParsedTurn {
  receipt: TurnReceipt
  touches: FileTouch[]
}

export interface ReceiptsQuery {
  key: string
  afterTurn?: number
}

export function receiptsOf(query: ReceiptsQuery): ReceiptsSlice {
  const parsed = turnsOf(query)
  return { turns: parsed.turns.map((one) => one.receipt), offset: parsed.offset }
}

export function turnsOf({ key, afterTurn = 0 }: ReceiptsQuery): { turns: ParsedTurn[]; offset: number } {
  const ref = transcriptIndex().get(key)
  if (!ref) return { turns: [], offset: 0 }
  const own = walk(records(ref.path), "")
  const lastOwn = own.events.reduce((at, one) => Math.max(at, one.at), 0)
  const events = [...own.events, ...subagentEvents(ref, own.spawns)].sort((a, b) => a.at - b.at)
  const turns = assemble({ boundaries: own.boundaries, events, lastOwn })
  return { turns: turns.filter((one) => one.receipt.turn > afterTurn), offset: ref.size }
}

type Boundary = { at: number; prompt: string }

type Spawn = { agent: string; description?: string }

type Event = { at: number; by: string } & (
  | { kind: "read"; path: string }
  | { kind: "ran"; ran: ReceiptCommand }
  | { kind: "touch"; touch: FileTouch }
  | ({ kind: "spawn" } & Spawn)
)

// Bucketed by time, not parentage, which only reads honestly because `by` names the agent.
function assemble({ boundaries, events, lastOwn }: { boundaries: Boundary[]; events: Event[]; lastOwn: number }): ParsedTurn[] {
  if (!boundaries.length) return []
  const blank = (turn: number, at: number, prompt?: string): ParsedTurn => ({
    receipt: { turn, at, prompt, read: [], wrote: [], deleted: [], ran: [] },
    touches: [],
  })
  const turns = boundaries.map((one, index) => blank(index + 1, one.at, one.prompt))
  // Agent work after the session went quiet belongs to no closed turn, so it gets an open one.
  const open = blank(turns.length + 1, lastOwn)
  const agents = [...boundaries, undefined].map(() => new Set<string>())
  let cursor = 0
  for (const event of events) {
    while (cursor + 1 < boundaries.length && boundaries[cursor + 1]!.at <= event.at) cursor++
    const inFlight = !!event.by && event.at > lastOwn
    const at = inFlight ? turns.length : cursor
    const turn = inFlight ? open : turns[cursor]!
    // A spawn is credited to the agent it started, not to whoever made the call.
    const who = event.kind === "spawn" ? event.agent : event.by
    if (who) agents[at]!.add(who)
    if (event.kind === "read") push(turn.receipt.read, event.path)
    else if (event.kind === "ran") turn.receipt.ran.push(event.ran)
    else if (event.kind === "spawn") pushRan(turn.receipt.ran, { command: `spawned ${event.agent}`, description: event.description })
    else {
      push(event.touch.kind === "delete" ? turn.receipt.deleted : turn.receipt.wrote, event.touch.path)
      turn.touches.push(event.touch)
    }
  }
  for (const [index, set] of agents.entries()) {
    const turn = index < turns.length ? turns[index] : open
    if (set.size && turn) turn.receipt.by = [...set]
  }
  return open.receipt.by ? [...turns, open] : turns
}

function subagentEvents(ref: TranscriptRef, spawns: Map<string, Spawn>): Event[] {
  const dir = join(projectsHome(), ref.slug, ref.id, "subagents")
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return []
  }
  const out: Event[] = []
  for (const file of files) {
    if (!file.endsWith(".jsonl")) continue
    out.push(...walk(records(join(dir, file)), agentName({ dir, file, spawns })).events)
  }
  return out
}

// `toolUseId` names the exact Agent call that spawned this one, so its name needs no guessing.
function agentName({ dir, file, spawns }: { dir: string; file: string; spawns: Map<string, Spawn> }): string {
  const meta = asRecord(safeJson(readTextSafe(join(dir, file.replace(/\.jsonl$/, ".meta.json"))) || ""))
  const spawned = spawns.get(text(meta?.toolUseId) || "")
  return text(meta?.name) || spawned?.agent || text(meta?.agentType) || file.replace(/^agent-|\.jsonl$/g, "") || "agent"
}

type Pending = { name: string; input: Record<string, unknown> }

function walk(entries: Record<string, unknown>[], by: string): { boundaries: Boundary[]; events: Event[]; spawns: Map<string, Spawn> } {
  const boundaries: Boundary[] = []
  const events: Event[] = []
  const spawns = new Map<string, Spawn>()
  const pending = new Map<string, Pending>()
  for (const entry of entries) {
    if (entry.type === "assistant") {
      for (const block of contentBlocks(entry.message)) {
        const id = text(block.id)
        const name = text(block.name)
        if (block.type !== "tool_use" || !id || !name) continue
        const input = asRecord(block.input)
        if (!input) continue
        // Recorded on the call, not the result: an agent still running has no result yet.
        if (name === "Agent") {
          const spawn: Spawn = { agent: text(input.name) || text(input.subagent_type) || "agent", description: text(input.description) }
          spawns.set(id, spawn)
          const at = atOf(entry.timestamp)
          if (at) events.push({ at, by, kind: "spawn", ...spawn })
          continue
        }
        pending.set(id, { name, input })
      }
      continue
    }
    if (entry.type !== "user") continue
    const blocks = contentBlocks(entry.message)
    const result = blocks.find((block) => block.type === "tool_result")
    const at = atOf(entry.timestamp)
    if (!at) continue
    if (result) {
      const id = text(result.tool_use_id)
      const call = id ? pending.get(id) : undefined
      if (id) pending.delete(id)
      // A subagent's own boundaries are its parent's turn, so only the session's file opens turns.
      if (call) events.push(...eventsOf({ call, at, by, failed: result.is_error === true, cwd: text(entry.cwd), result: entry.toolUseResult }))
      continue
    }
    if (by || entry.isSidechain || entry.isMeta) continue
    const prompt = promptOf(entry.message, blocks)
    if (prompt) boundaries.push({ at, prompt })
  }
  return { boundaries, events, spawns }
}

type CallArgs = { call: Pending; at: number; by: string; failed: boolean; cwd?: string; result: unknown }

function eventsOf({ call, at, by, failed, cwd, result }: CallArgs): Event[] {
  if (call.name === "Bash" || call.name === "bash") {
    const command = text(call.input.command)
    if (!command) return []
    const ran: ReceiptCommand = { command }
    const description = text(call.input.description)
    if (description) ran.description = description
    if (failed) ran.failed = true
    if (call.input.run_in_background === true) ran.background = true
    const out: Event[] = [{ at, by, kind: "ran", ran }]
    if (!failed) {
      for (const path of removedPaths(command, cwd)) out.push({ at, by, kind: "touch", touch: { path, kind: "delete", by, at } })
    }
    return out
  }
  if (failed) return []
  const path = filePathOf(call, result)
  if (!path) return []
  if (call.name === "Read") return [{ at, by, kind: "read", path }]
  if (call.name !== "Write" && call.name !== "Edit" && call.name !== "NotebookEdit") return []
  return [{ at, by, kind: "touch", touch: { ...touchOf({ path, call, result }), by, at } }]
}

function touchOf({ path, call, result }: { path: string; call: Pending; result: unknown }): Omit<FileTouch, "by" | "at"> {
  const detail = asRecord(result)
  const prior = typeof detail?.originalFile === "string" ? detail.originalFile : undefined
  if (call.name === "Write" || call.name === "NotebookEdit") {
    const content = typeof detail?.content === "string" ? detail.content : text(call.input.content)
    return { path, kind: "write", prior, content, created: detail?.type === "create" || undefined }
  }
  const old = call.input.old_string
  const next = call.input.new_string
  if (typeof old !== "string" || typeof next !== "string") return { path, kind: "edit", prior }
  return { path, kind: "edit", prior, edit: { old, new: next, all: call.input.replace_all === true || undefined } }
}

// The result's echo beats the call's argument: a relative file_path was resolved by the tool.
function filePathOf(call: Pending, result: unknown): string | undefined {
  const detail = asRecord(result)
  const path = text(detail?.filePath) || text(asRecord(detail?.file)?.filePath) || text(call.input.file_path) || text(call.input.notebook_path)
  return path && isAbsolute(path) ? path : undefined
}

export function applyEdit(content: string, edit: FileEdit): string | undefined {
  if (!edit.old) return edit.all ? undefined : edit.new + content
  const at = content.indexOf(edit.old)
  if (at < 0) return undefined
  // Not String.replace: a `$&` or `$1` in the new text would be read as a capture reference.
  if (!edit.all) return content.slice(0, at) + edit.new + content.slice(at + edit.old.length)
  return content.split(edit.old).join(edit.new)
}

const REMOVERS = new Set(["rm", "unlink"])

// No delete tool exists, so this reads commands. Narrow on purpose: a `find -delete` is not claimed.
export function removedPaths(command: string, cwd?: string): string[] {
  const out: string[] = []
  for (const segment of command.split(/\n|;|&&|\|\||\||&/)) {
    const words = shellWords(segment)
    let head = words[0] === "sudo" ? words.slice(1) : words
    if (head[0] === "git") head = head.slice(1)
    if (!head.length || !REMOVERS.has(head[0] as string)) continue
    for (const word of head.slice(1)) {
      if (word.startsWith("-") || /[*?$`~[\]{}]/.test(word)) continue
      const path = isAbsolute(word) ? word : cwd ? resolve(cwd, word) : undefined
      if (path) push(out, path)
    }
  }
  return out
}

// Quoting has to survive so a path with a space in it stays one word.
function shellWords(segment: string): string[] {
  const out: string[] = []
  let word = ""
  let quote = ""
  let open = false
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i] as string
    if (quote) {
      if (char === quote) quote = ""
      else word += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      open = true
      continue
    }
    if (char === "\\" && i + 1 < segment.length) {
      word += segment[++i]
      open = true
      continue
    }
    if (/\s/.test(char)) {
      if (word || open) out.push(word)
      word = ""
      open = false
      continue
    }
    word += char
    open = true
  }
  if (word || open) out.push(word)
  return out
}

function promptOf(message: unknown, blocks: Record<string, unknown>[]): string | undefined {
  const raw = asRecord(message)?.content
  const joined =
    typeof raw === "string" ? raw : blocks.filter((one) => one.type === "text").map((one) => text(one.text) || "").join("")
  const stripped = joined.replace(REMINDER, "").trim()
  if (!stripped || NOISE.test(stripped)) return undefined
  if (!stripped.startsWith("<command-")) return stripped.slice(0, PROMPT_CHARS)
  const parts = [...stripped.matchAll(COMMAND)].map((one) => (one[1] || one[2] || "").trim()).filter(Boolean)
  return parts.length ? parts.join(" ").slice(0, PROMPT_CHARS) : undefined
}

function records(path: string): Record<string, unknown>[] {
  const window = readWindow(path, "head", Number.MAX_SAFE_INTEGER)
  if (!window) return []
  const out: Record<string, unknown>[] = []
  for (const line of usableLines(window, "head")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed[0] !== "{") continue
    const parsed = asRecord(safeJson(trimmed))
    if (parsed) out.push(parsed)
  }
  return out
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function contentBlocks(message: unknown): Record<string, unknown>[] {
  const content = asRecord(message)?.content
  if (!Array.isArray(content)) return []
  return content.filter((one): one is Record<string, unknown> => typeof one === "object" && !!one)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && !!value ? (value as Record<string, unknown>) : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && !!value.trim() ? value.trim() : undefined
}

function push(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value)
}

function pushRan(list: ReceiptCommand[], ran: ReceiptCommand): void {
  if (!list.some((one) => one.command === ran.command)) list.push(ran)
}

function atOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string" || !value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}
