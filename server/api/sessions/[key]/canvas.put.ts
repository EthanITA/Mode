import type { CanvasPlacement } from "~~/shared/types/canvas"
import { writeCanvas } from "~~/server/utils/sessions/canvas"
import { isKey } from "~~/server/utils/sessions/paths"

export default defineEventHandler(async (event): Promise<CanvasPlacement> => {
  const key = getRouterParam(event, "key") || ""
  if (!isKey(key)) throw createError({ statusCode: 400, statusMessage: "invalid key" })
  return writeCanvas(key, await readBody<CanvasPlacement>(event))
})
