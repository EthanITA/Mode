import { readdirSync } from "node:fs"
import { join } from "node:path"
import type { BoardCategory, BoardSummary, BoardTask } from "~~/shared/types/board"
import { readTextSafe } from "../mode/fsutil.ts"
import { configRoot } from "../mode/paths.ts"

const SUBJECT_PREFIX = /^(?:#\d+\s*)?(?:\[(AI|USER|WAIT)\]\s*)?/i

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
    return { tasks: [], count: 0, waitingOnMarco: 0 }
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
  }
}
