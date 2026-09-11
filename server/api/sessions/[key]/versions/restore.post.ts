import type { RestoreResult } from "~~/shared/types/versions"
import { Versions } from "~~/server/utils/sessions/versions"

function payloadOf(raw: unknown): { path: string; turn: number; force: boolean } | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const { path, turn, force } = raw as Record<string, unknown>
  if (typeof path !== "string" || !path || typeof turn !== "number") return undefined
  return { path, turn, force: Boolean(force) }
}

export default defineEventHandler(async (event): Promise<RestoreResult> => {
  const key = getRouterParam(event, "key") || ""
  const body = payloadOf(await readBody(event))
  if (!key || !body) return { path: "", turn: 0, restored: false, forceable: false, reason: "a path and a turn are required" }
  return Versions.restore({ key, ...body })
})
