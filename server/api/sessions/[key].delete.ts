import { isKey } from "~~/server/utils/sessions/paths"
import { removeSession, type Removal } from "~~/server/utils/sessions/removal"

export default defineEventHandler(async (event): Promise<Removal> => {
  const key = getRouterParam(event, "key") || ""
  if (!isKey(key)) throw createError({ statusCode: 400, statusMessage: "invalid key" })
  const outcome = await removeSession(key)
  if (outcome.refused) throw createError({ statusCode: 409, statusMessage: outcome.refused, data: outcome })
  return outcome
})
