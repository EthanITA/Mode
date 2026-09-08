import { liveSessions } from "~~/server/utils/sessions"
import type { LiveSession } from "../../shared/types/session"

export default defineEventHandler((): LiveSession[] => {
  return liveSessions()
})
