export type SystemNote = { label: string }

// The queue records no origin, so the harness's own tag is the only thing telling system from typed.
const TAGS: [RegExp, (hit: RegExpMatchArray) => string][] = [
  [/<task-notification>[\s\S]*?<task-id>([^<]+)<\/task-id>/, (m) => `Task(${m[1]?.trim()})`],
  [/<task-notification>/, () => "Task notification"],
  [/<command-name>([^<]+)<\/command-name>/, (m) => `Command(${m[1]?.trim().replace(/^\//, "")})`],
  [/<local-command-stdout>/, () => "Command output"],
  [/<user-prompt-submit-hook>/, () => "Hook(UserPromptSubmit)"],
  [/<persisted-output>/, () => "Output persisted"],
  [/<local-command-caveat>/, () => "Session caveat"],
  // A path never matches: a "/" always follows the token there, never whitespace or end.
  [/^\/[^\s/]+(?:\s|$)/, (m) => `Command(${m[0].trim().replace(/^\//, "")})`],
]

// Anywhere, not just at the start: an interruption sits between the withdrawn ask and the next one.
const INTERRUPT = /\[Request interrupted[^\]]*\]/g

// A reminder wrapping a real message is context around it, not a message of its own.
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g

const WRAPPERS = [
  /<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g,
  /<command-name>[\s\S]*?<\/command-name>\s*<command-message>[\s\S]*?<\/command-message>\s*<command-args>[\s\S]*?<\/command-args>/g,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,
]

export function noteOf(text: string): SystemNote | undefined {
  const body = text.trim()
  for (const [pattern, label] of TAGS) {
    const hit = body.match(pattern)
    if (hit) return { label: label(hit) }
  }
  const stripped = body.replace(REMINDER, "").trim()
  return stripped ? undefined : { label: "System reminder" }
}

export function withoutReminders(text: string): string {
  return text.replace(REMINDER, "").trim()
}

export type Piece = { kind: "note"; label: string } | { kind: "said"; text: string }

/** The message in order, so a withdrawn ask keeps its place ahead of the interruption. */
export function readOut(text: string): Piece[] {
  const body = withoutReminders(text)
  if (!body) return [{ kind: "note", label: "System reminder" }]

  const note = noteOf(body)
  if (note) {
    const prose = WRAPPERS.reduce((acc, wrapper) => acc.replace(wrapper, ""), body).trim()
    return prose && prose !== body ? [{ kind: "note", label: note.label }, { kind: "said", text: prose }] : [{ kind: "note", label: note.label }]
  }

  const out: Piece[] = []
  let last = 0
  INTERRUPT.lastIndex = 0
  for (let hit = INTERRUPT.exec(body); hit; hit = INTERRUPT.exec(body)) {
    const said = body.slice(last, hit.index).trim()
    if (said) out.push({ kind: "said", text: said })
    out.push({ kind: "note", label: "Interrupted" })
    last = hit.index + hit[0].length
  }
  const rest = body.slice(last).trim()
  if (rest) out.push({ kind: "said", text: rest })
  return out
}

const ARG_KEYS = ["file_path", "path", "pattern", "url", "skill", "command", "subject", "taskId", "query", "description"]

// One argument per call, chosen rather than dumped: the point is to read the line, not audit it.
export function argOf(tool: string, input: unknown): string | undefined {
  if (typeof input !== "object" || !input) return undefined
  const rec = input as Record<string, unknown>
  // The question is the argument, and it is nested a level deeper than every other tool's.
  if (tool === "AskUserQuestion") return firstQuestion(rec)
  const preferred = tool === "Bash" ? ["description", "command"] : ARG_KEYS
  for (const key of preferred) {
    const value = rec[key]
    if (typeof value !== "string" || !value.trim()) continue
    const one = value.trim().split("\n")[0] ?? ""
    return key === "file_path" || key === "path" ? shorten(one) : one
  }
  return undefined
}

function firstQuestion(rec: Record<string, unknown>): string | undefined {
  const { questions } = rec as { questions?: unknown }
  if (!Array.isArray(questions)) return undefined
  for (const one of questions) {
    const asked = (one as Record<string, unknown>)?.question
    if (typeof asked === "string" && asked.trim()) return asked.trim()
  }
  return undefined
}

function shorten(path: string): string {
  const parts = path.split("/").filter(Boolean)
  return parts.length > 2 ? parts.slice(-2).join("/") : (parts.join("/") || path)
}

