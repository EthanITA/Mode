import { readWindow, transcriptIndex, usableLines } from "./transcripts.ts"

export type ConversationTurn = {
  role: "user" | "assistant"
  text: string
  at: number
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
  for (const line of usableLines({ text: prefix, whole: true }, "head")) {
    const turn = turnOf(line)
    if (!turn) continue
    if (turn.role === "user") {
      const said = echo.get(turn.text)
      if (said && turn.at - said < QUEUE_ECHO_MS) continue
      echo.set(turn.text, turn.at)
    }
    turns.push(turn)
  }
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
// tool_result the text scan skips, and remove/popAll repeat the same words.
function queuedOf(entry: Record<string, unknown>): ConversationTurn | undefined {
  if (entry.operation !== "enqueue") return undefined
  const { content } = entry
  if (typeof content !== "string" || !content.trim()) return undefined
  const at = atOf(entry.timestamp)
  return at ? { role: "user", text: content, at } : undefined
}

function turnOf(line: string): ConversationTurn | undefined {
  const entry = record(line)
  if (!entry) return undefined
  if (entry.type === "queue-operation") return queuedOf(entry)
  if (entry.type !== "user" && entry.type !== "assistant") return undefined
  if (entry.isSidechain) return undefined
  const message = entry.message
  if (typeof message !== "object" || !message) return undefined
  const text = textOf((message as Record<string, unknown>).content)
  if (!text) return undefined
  const at = atOf(entry.timestamp)
  if (!at) return undefined
  return { role: entry.type, text, at }
}

function textOf(content: unknown): string | undefined {
  if (typeof content === "string") return content.trim() ? content : undefined
  if (!Array.isArray(content)) return undefined
  const parts: string[] = []
  for (const part of content) {
    if (typeof part !== "object" || !part) continue
    const rec = part as Record<string, unknown>
    if (rec.type !== "text" || typeof rec.text !== "string") continue
    parts.push(rec.text)
  }
  if (!parts.length) return undefined
  const joined = parts.join("")
  return joined.trim() ? joined : undefined
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
