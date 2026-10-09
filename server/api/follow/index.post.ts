import type { FollowReply } from "~~/shared/types/review"
import { pointAt } from "~~/server/utils/review/follow"
import { isKey } from "~~/server/utils/sessions/paths"

function fieldOf(raw: unknown, name: string): string {
  const value = typeof raw === "object" && raw ? (raw as Record<string, unknown>)[name] : ""
  return typeof value === "string" ? value : ""
}

export default defineEventHandler(async (event): Promise<FollowReply> => {
  const raw: unknown = await readBody(event)
  const key = fieldOf(raw, "key").toLowerCase()
  if (!isKey(key)) throw createError({ statusCode: 400, statusMessage: "key must be a session's 8-hex key" })
  return { listeners: pointAt({ key, source: fieldOf(raw, "source") === "prompt" ? "prompt" : "claude" }) }
})
