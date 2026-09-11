import { plain } from "./relay.ts"
import { argOf, readOut } from "./speaker.ts"
import { readWindow, transcriptIndex, usableLines } from "./transcripts.ts"

// Narration and answer share the provider's `text` block, told apart only by position.
export type TurnKind = "thinking" | "narration" | "answer" | "acting" | "note" | "drop" | "done"

export type AskOption = { label: string; description?: string }
export type Ask = { question: string; header?: string; multi?: true; options: AskOption[] }

export type ConversationTurn = {
  role: "user" | "assistant" | "system"
  text: string
  at: number
  kind?: TurnKind
  tool?: string
  arg?: string
  /** AskUserQuestion only, so the chat can offer the options instead of an opaque tool row. */
  ask?: Ask[]
  /** The provider's tool_use id, so a result pairs back to its call. */
  ref?: string
  /** Started with run_in_background, so it is long-running by construction. */
  bg?: true
  /** Typed but not yet delivered, so the turn it belongs to has not started. */
  queued?: boolean
}

export type ConversationSlice = {
  turns: ConversationTurn[]
  offset: number
}

export type ConversationQuery = {
  key: string
  since?: number
}

const QUEUE_ECHO_MS = 60_000

export function conversationOf({ key, since = 0 }: ConversationQuery): ConversationSlice {
  const ref = transcriptIndex().get(key)
  if (!ref) return { turns: [], offset: 0 }
  const start = since > 0 ? since : 0
  if (start >= ref.size) return { turns: [], offset: ref.size }
  // tail of (size-start) bytes is the file from `start`; head is the same when start is 0
  const window = readWindow(ref.path, start ? "tail" : "head", ref.size - start)
  if (!window) return { turns: [], offset: start }
  const prefix = throughLastNewline(window.text)
  if (!prefix) return { turns: [], offset: start }
  const turns: ConversationTurn[] = []
  // The harness re-queues a mid-turn message, writing it twice with replies in between.
  const echo = new Map<string, number>()
  // A result carries no tool name of its own; only the call it pairs to does.
  const toolByRef = new Map<string, string>()
  for (const line of usableLines({ text: prefix, whole: true }, "head")) {
    for (const turn of turnOf(line)) {
      if (turn.role === "user") {
        const said = echo.get(turn.text)
        if (said && turn.at - said < QUEUE_ECHO_MS) continue
        echo.set(turn.text, turn.at)
      }
      if (turn.kind === "acting" && turn.ref && turn.tool) toolByRef.set(turn.ref, turn.tool)
      else if (turn.kind === "done" && turn.ref) turn.tool = toolByRef.get(turn.ref)
      turns.push(turn)
    }
  }
  settle(turns)
  return { turns, offset: start + Buffer.byteLength(prefix, "utf8") }
}

function throughLastNewline(text: string): string | undefined {
  const n = text.lastIndexOf("\n")
  const r = text.lastIndexOf("\r")
  const at = n > r ? n : r
  if (at < 0) return undefined
  return text.slice(0, at + 1)
}

// A mid-turn message lands only here: the copy that reached the model is buried in a
// tool_result the text scan skips.
function queuedOf(entry: Record<string, unknown>): ConversationTurn[] {
  const at = atOf(entry.timestamp)
  if (!at) return []
  const { content } = entry
  const said = typeof content === "string" ? content : ""
  if (entry.operation === "enqueue") return said.trim() ? spoke(said, at, true) : []
  // Cancelled, or handed to the model as a real turn: either way the queued copy stops standing.
  if (entry.operation === "remove") return [{ role: "system", kind: "drop", text: plain(said), at }]
  if (entry.operation === "dequeue" || entry.operation === "popAll") {
    return [{ role: "system", kind: "drop", text: "", at }]
  }
  return []
}

// One entry can hold a withdrawn ask, an interruption and a live ask, and all three keep their order.
function spoke(text: string, at: number, queued = false): ConversationTurn[] {
  return readOut(text).map((piece) =>
    piece.kind === "note"
      ? { role: "system" as const, text: piece.label, at, kind: "note" as const }
      : { role: "user" as const, text: plain(piece.text), at, queued: queued || undefined },
  )
}

function turnOf(line: string): ConversationTurn[] {
  const entry = record(line)
  if (!entry) return []
  if (entry.type === "queue-operation") return queuedOf(entry)
  if (entry.type !== "user" && entry.type !== "assistant") return []
  if (entry.isSidechain) return []
  const at = atOf(entry.timestamp)
  if (!at) return []
  // The 28KB summary body is never worth carrying into a turn; only its presence is.
  if (entry.isCompactSummary) return [{ role: "system", text: "Compacted", at, kind: "note" }]
  const message = entry.message
  if (typeof message !== "object" || !message) return []
  const content = (message as Record<string, unknown>).content
  // A result-only entry has no text, thinking or tool_use block, so saidOf below would drop it.
  if (entry.type === "user") {
    const ref = resultRefOf(content)
    if (ref) return [{ role: "system", text: "", at, kind: "done", ref }]
  }
  const said = saidOf(content)
  if (!said) return []
  if (entry.type === "user") return spoke(said.text, at)
  return [{ role: "assistant", text: said.text, at, kind: said.kind, tool: said.tool, arg: said.arg, ref: said.ref, bg: said.bg, ask: said.ask }]
}

function resultRefOf(content: unknown): string | undefined {
  const first = Array.isArray(content) ? content[0] : undefined
  if (typeof first !== "object" || !first) return undefined
  const rec = first as Record<string, unknown>
  return rec.type === "tool_result" && typeof rec.tool_use_id === "string" ? rec.tool_use_id : undefined
}

type Said = { text: string; kind: TurnKind; tool?: string; arg?: string; ref?: string; bg?: true; ask?: Ask[] }

function optionsOf(raw: unknown): AskOption[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((one) => {
    const rec = one as Record<string, unknown>
    if (typeof rec?.label !== "string" || !rec.label) return []
    return [{ label: rec.label, description: typeof rec.description === "string" ? rec.description : undefined }]
  })
}

function asksOf(input: unknown): Ask[] | undefined {
  if (typeof input !== "object" || !input) return undefined
  const { questions } = input as { questions?: unknown }
  if (!Array.isArray(questions)) return undefined
  const out = questions.flatMap((one) => {
    const rec = one as Record<string, unknown>
    if (typeof rec?.question !== "string" || !rec.question) return []
    return [{
      question: rec.question,
      header: typeof rec.header === "string" ? rec.header : undefined,
      multi: rec.multiSelect === true ? (true as const) : undefined,
      options: optionsOf(rec.options),
    }]
  })
  return out.length ? out : undefined
}

// An assistant turn carries one block type at a time, so the first kind present decides the turn.
function saidOf(content: unknown): Said | undefined {
  if (typeof content === "string") return content.trim() ? { text: content, kind: "narration" } : undefined
  if (!Array.isArray(content)) return undefined
  const spoken: string[] = []
  const thought: string[] = []
  let tool: string | undefined
  let arg: string | undefined
  let ref: string | undefined
  let bg: true | undefined
  let ask: Ask[] | undefined
  for (const part of content) {
    if (typeof part !== "object" || !part) continue
    const rec = part as Record<string, unknown>
    if (rec.type === "text" && typeof rec.text === "string") spoken.push(rec.text)
    else if (rec.type === "thinking" && typeof rec.thinking === "string") thought.push(rec.thinking)
    else if (rec.type === "tool_use" && typeof rec.name === "string" && !tool) {
      tool = rec.name
      arg = argOf(rec.name, rec.input)
      ask = rec.name === "AskUserQuestion" ? asksOf(rec.input) : undefined
      ref = typeof rec.id === "string" ? rec.id : undefined
      const input = rec.input as Record<string, unknown> | undefined
      bg = input?.run_in_background === true ? true : undefined
    }
  }
  const say = spoken.join("")
  if (say.trim()) return { text: say, kind: "narration" }
  const think = thought.join("")
  if (think.trim()) return { text: think, kind: "thinking" }
  return tool ? { text: tool, kind: "acting", tool, arg, ref, bg, ask } : undefined
}

// Nothing marks an answer at the time it is written; it is the last thing said before the user speaks.
function settle(turns: ConversationTurn[]): void {
  let latest: ConversationTurn | undefined
  for (const turn of turns) {
    if (turn.role === "user") {
      if (latest) latest.kind = "answer"
      latest = undefined
    } else if (turn.kind === "narration") {
      latest = turn
    }
  }
}

function atOf(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string" || !value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
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
