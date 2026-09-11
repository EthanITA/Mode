import type { BoardSummary } from "~~/shared/types/board"
import { boardOf } from "~~/server/utils/sessions/board"

export default defineEventHandler((event): BoardSummary => {
  const key = getRouterParam(event, "key") || ""
  return boardOf(key)
})
