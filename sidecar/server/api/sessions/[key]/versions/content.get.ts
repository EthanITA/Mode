import type { VersionContent } from "~~/shared/types/versions"
import { Versions } from "~~/server/utils/sessions/versions"

export default defineEventHandler((event): Promise<VersionContent> => {
  const key = getRouterParam(event, "key") || ""
  const { path, turn } = getQuery(event)
  if (typeof path !== "string" || !path) return Promise.resolve({ path: "", turn: 0, found: false, reason: "missing-content" })
  return Versions.content({ key, path, turn: Number(turn) || 0 })
})
