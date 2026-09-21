import type { ConversationVersions } from "~~/shared/types/versions"
import { Versions } from "~~/server/utils/sessions/versions"

export default defineEventHandler((event): Promise<ConversationVersions> => {
  const key = getRouterParam(event, "key") || ""
  const path = getQuery(event).path
  return Versions.list({ key, path: typeof path === "string" ? path : undefined })
})
