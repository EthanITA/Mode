import { conversationOf, type ConversationSlice } from "~~/server/utils/sessions/conversation"

function sinceOf(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== "string" || !value) return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export default defineEventHandler((event): ConversationSlice => {
  const key = getRouterParam(event, "key") || ""
  return conversationOf({ key, since: sinceOf(getQuery(event).since) })
})
