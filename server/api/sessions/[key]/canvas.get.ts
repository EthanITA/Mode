import type { CanvasPlacement } from "~~/shared/types/canvas"
import { canvasOf } from "~~/server/utils/sessions/canvas"
import { isKey } from "~~/server/utils/sessions/paths"

export default defineEventHandler((event): CanvasPlacement | undefined => {
  const key = getRouterParam(event, "key") || ""
  if (!isKey(key)) throw createError({ statusCode: 400, statusMessage: "invalid key" })
  return canvasOf(key)
})
