import { readdirSync } from "node:fs"
import { join } from "node:path"
import type { BoardCategory, BoardSummary, BoardTask } from "~~/shared/types/board"
import { readTextSafe } from "../mode/fsutil.ts"
import { configRoot } from "../mode/paths.ts"

const SUBJECT_PATTERN = /^#\d+\s*\[(AI|USER|WAIT)\]\s*/

function tasksHome(key: string): string {
  return join(configRoot(), "tasks", `session-${key}`)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : []
}

function subjectOf(subject: string): { category: BoardCategory; text: string } {
  const match = subject.match(SUBJECT_PATTERN)
  if (!match) return { category: "AI", text: subject.trim() }
  return { category: match[1] as BoardCategory, text: subject.slice(match[0].length).trim() }
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

export function boardOf(key: string): BoardSummary {
  const dir = tasksHome(key)
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return { tasks: [], count: 0, waitingOnMarco: 0 }
  }
  const tasks = files
    .filter((file) => file.endsWith(".json"))
    .map((file) => readTask(join(dir, file)))
    .filter((task): task is BoardTask => !!task)
    .sort((a, b) => Number(a.id) - Number(b.id))
  return {
    tasks,
    count: tasks.filter((task) => !task.done).length,
    waitingOnMarco: tasks.filter((task) => task.category === "USER" && !task.done).length,
  }
}
