import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { BoardAction, BoardCategory, BoardSummary, BoardTask } from "~~/shared/types/board"
import { readTextSafe } from "../mode/fsutil.ts"
import { configRoot } from "../mode/paths.ts"

const SUBJECT_PREFIX = /^(?:#\d+\s*)?(?:\[(AI|USER|WAIT)\]\s*)?/i
const TASK_ID = /^\d+$/
const ID_COLUMN = 3
const ID_ATTEMPTS = 25
const NEWS_CAP = 50

function tasksHome(key: string): string {
  return join(configRoot(), "tasks", `session-${key}`)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : []
}

export function subjectOf(subject: string): { category: BoardCategory; text: string } {
  const match = subject.match(SUBJECT_PREFIX)
  const category = (match?.[1]?.toUpperCase() as BoardCategory) || "AI"
  const text = match ? subject.slice(match[0].length).trim() : subject.trim()
  return { category, text: text || subject.trim() }
}

function taskOf(raw: unknown): BoardTask | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const record = raw as Record<string, unknown>
  const id = typeof record.id === "string" ? record.id : undefined
  const subject = typeof record.subject === "string" ? record.subject : undefined
  const status = record.status
  if (!id || !subject || status === "deleted") return undefined
  if (status !== "pending" && status !== "in_progress" && status !== "completed") return undefined
  const { category, text } = subjectOf(subject)
  return {
    id,
    text,
    category,
    status,
    done: status === "completed",
    owner: typeof record.owner === "string" ? record.owner : undefined,
    blocks: strings(record.blocks),
    blockedBy: strings(record.blockedBy),
  }
}

// Racing the live session's own task-tool write can catch a file half-written; skip it, don't fail the board.
function readTask(path: string): BoardTask | undefined {
  const raw = readTextSafe(path)
  if (!raw) return undefined
  try {
    return taskOf(JSON.parse(raw))
  } catch {
    return undefined
  }
}

export function isTaskBlocked(task: BoardTask, all: BoardTask[] = []): boolean {
  if (task.done || task.status === "completed") return false
  if (task.category === "WAIT") return true
  if (!task.blockedBy || task.blockedBy.length === 0) return false
  return task.blockedBy.some((id) => {
    const blocker = all.find((t) => t.id === id)
    return !blocker || (!blocker.done && blocker.status !== "completed")
  })
}

export function taskPriority(task: BoardTask, all: BoardTask[] = []): 1 | 2 | 3 | 4 {
  if (task.done || task.status === "completed") return 4
  if (task.status === "in_progress") return 1
  if (isTaskBlocked(task, all)) return 3
  return 2
}

export function compareBoardTasks(a: BoardTask, b: BoardTask, all: BoardTask[] = []): number {
  const prioA = taskPriority(a, all)
  const prioB = taskPriority(b, all)
  if (prioA !== prioB) return prioA - prioB
  const numA = Number(a.id)
  const numB = Number(b.id)
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB
  return a.id.localeCompare(b.id)
}

export function boardOf(key: string): BoardSummary {
  const dir = tasksHome(key)
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return { tasks: [], count: 0, waitingOnMarco: 0, order: [] }
  }
  const unranked = files
    .filter((file) => file.endsWith(".json"))
    .map((file) => readTask(join(dir, file)))
    .filter((task): task is BoardTask => !!task)
  const tasks = [...unranked].sort((a, b) => compareBoardTasks(a, b, unranked))
  return {
    tasks,
    count: tasks.filter((task) => !task.done).length,
    waitingOnMarco: tasks.filter((task) => task.category === "USER" && !task.done).length,
    order: sideOf(key).order.filter((id) => tasks.some((task) => task.id === id)),
  }
}

interface BoardNews {
  seq: number
  kind: "added" | "completed" | "reopened" | "owner"
  id: string
  text?: string
  owner?: string
}

interface BoardSide {
  order: string[]
  nextSeq: number
  news: BoardNews[]
}

function sideHome(): string {
  return join(configRoot(), "board")
}

function sideOf(key: string): BoardSide {
  const empty: BoardSide = { order: [], nextSeq: 1, news: [] }
  const raw = readTextSafe(join(sideHome(), `session-${key}.json`))
  if (!raw) return empty
  try {
    const parsed = JSON.parse(raw) as Partial<BoardSide>
    const news = Array.isArray(parsed.news) ? parsed.news.filter((one): one is BoardNews => !!one) : []
    return { order: strings(parsed.order), nextSeq: Number(parsed.nextSeq) || 1, news }
  } catch {
    return empty
  }
}

function writeSide(key: string, side: BoardSide): void {
  mkdirSync(sideHome(), { recursive: true })
  const path = join(sideHome(), `session-${key}.json`)
  const staging = `${path}.staging`
  writeFileSync(staging, JSON.stringify(side))
  renameSync(staging, path)
}

function seenOf(key: string): number {
  return Number(readTextSafe(join(sideHome(), `session-${key}.seen`))?.trim()) || 0
}

function record(key: string, entry: Omit<BoardNews, "seq">): void {
  const side = sideOf(key)
  const seen = seenOf(key)
  const kept = side.news.filter((one) => one.seq > seen).slice(-NEWS_CAP)
  writeSide(key, { ...side, nextSeq: side.nextSeq + 1, news: [...kept, { ...entry, seq: side.nextSeq }] })
}

function nextTaskId(dir: string): number {
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return 1
  }
  const ids = files
    .filter((file) => file.endsWith(".json"))
    .map((file) => Number(file.slice(0, -".json".length)))
    .filter((id) => Number.isInteger(id))
  return Math.max(0, ...ids) + 1
}

export function stampSubject(id: string, category: BoardCategory, text: string): string {
  return `${`#${id}`.padEnd(ID_COLUMN)} [${category}] ${text}`
}

function taskFile(key: string, id: string): string {
  return join(tasksHome(key), `${id}.json`)
}

function addTask(key: string, text: string): string {
  const dir = tasksHome(key)
  mkdirSync(dir, { recursive: true })
  let id = nextTaskId(dir)
  // wx mirrors the harness's own ifAbsent precondition, so whichever writer loses the race takes the next id.
  for (let tries = 0; tries < ID_ATTEMPTS; tries += 1, id += 1) {
    const task = {
      id: String(id),
      subject: stampSubject(String(id), "AI", text),
      description: text,
      status: "pending",
      blocks: [],
      blockedBy: [],
    }
    try {
      writeFileSync(taskFile(key, String(id)), JSON.stringify(task, undefined, 2), { flag: "wx" })
      return String(id)
    } catch {
      continue
    }
  }
  throw new Error("could not claim a free task id")
}

function patchTask(key: string, id: string, patch: Record<string, unknown>): BoardTask | undefined {
  const raw = readTextSafe(taskFile(key, id))
  if (!raw) return undefined
  try {
    const next = { ...(JSON.parse(raw) as Record<string, unknown>), ...patch }
    writeFileSync(taskFile(key, id), JSON.stringify(next, undefined, 2))
    return taskOf(next)
  } catch {
    return undefined
  }
}

export function applyBoardAction(key: string, action: BoardAction): BoardSummary {
  if (action.kind === "order") {
    writeSide(key, { ...sideOf(key), order: action.ids.filter((id) => TASK_ID.test(id)) })
    return boardOf(key)
  }

  if (action.kind === "add") {
    const text = subjectOf(action.text.replace(/\s+/g, " ").trim()).text
    if (!text) throw new Error("a task needs a subject")
    record(key, { kind: "added", id: addTask(key, text), text })
    return boardOf(key)
  }

  if (!TASK_ID.test(action.id)) throw new Error("unknown task")
  const before = boardOf(key).tasks.find((task) => task.id === action.id)
  if (!before) throw new Error("unknown task")

  if (action.kind === "done") {
    if (before.done !== action.done) {
      patchTask(key, action.id, { status: action.done ? "completed" : "pending" })
      record(key, { kind: action.done ? "completed" : "reopened", id: action.id })
    }
    return boardOf(key)
  }

  if (before.owner !== action.owner) {
    patchTask(key, action.id, { owner: action.owner })
    record(key, { kind: "owner", id: action.id, owner: action.owner })
  }
  return boardOf(key)
}
