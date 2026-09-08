import { Models } from "../../utils/models"
import type {
  FastChatMessage,
  FastModelReply,
  FastModelRequest,
  FastTask,
} from "../../../shared/types/models"

function isTask(value: unknown): value is FastTask {
  return value === "edit" || value === "answer" || value === "chat"
}

function isChatMessage(value: unknown): value is FastChatMessage {
  if (typeof value !== "object" || !value) return false
  const record = value as Record<string, unknown>
  const validRole = record.role === "user" || record.role === "assistant"
  return validRole && typeof record.text === "string"
}

function parseRequest(raw: unknown): FastModelRequest | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const record = raw as Record<string, unknown>
  if (!isTask(record.task)) return undefined
  if (typeof record.instruction !== "string" || !record.instruction.trim()) return undefined
  if (typeof record.selection !== "string") return undefined

  const context = typeof record.context === "string" ? record.context : undefined
  if (record.context && !context) return undefined

  let history: FastChatMessage[] | undefined
  if (record.history) {
    if (!Array.isArray(record.history) || !record.history.every(isChatMessage)) return undefined
    history = record.history
  }

  return {
    task: record.task,
    instruction: record.instruction,
    selection: record.selection,
    ...(context ? { context } : {}),
    ...(history ? { history } : {}),
  }
}

export default defineEventHandler(async (event): Promise<FastModelReply> => {
  const request = parseRequest(await readBody(event))
  if (!request) {
    throw createError({ statusCode: 400, statusMessage: "Invalid request body" })
  }
  return Models.fast(request)
})
