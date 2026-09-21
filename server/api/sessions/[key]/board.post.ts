import type { BoardAction, BoardSummary } from "~~/shared/types/board"
import { applyBoardAction } from "~~/server/utils/sessions/board"
import { isKey } from "~~/server/utils/sessions/paths"

function actionOf(raw: unknown): BoardAction | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const body = raw as Record<string, unknown>
  const id = typeof body.id === "string" ? body.id : ""
  switch (body.kind) {
    case "add":
      return typeof body.text === "string" ? { kind: "add", text: body.text } : undefined
    case "done":
      return id && typeof body.done === "boolean" ? { kind: "done", id, done: body.done } : undefined
    case "owner":
      return id && typeof body.owner === "string" && body.owner ? { kind: "owner", id, owner: body.owner } : undefined
    case "order":
      return Array.isArray(body.ids)
        ? { kind: "order", ids: body.ids.filter((one): one is string => typeof one === "string") }
        : undefined
    default:
      return undefined
  }
}

export default defineEventHandler(async (event): Promise<BoardSummary> => {
  const key = getRouterParam(event, "key") || ""
  if (!isKey(key)) throw createError({ statusCode: 400, statusMessage: "invalid key" })
  const action = actionOf(await readBody(event))
  if (!action) throw createError({ statusCode: 400, statusMessage: "invalid action" })
  try {
    return applyBoardAction(key, action)
  } catch (caught) {
    throw createError({
      statusCode: 409,
      statusMessage: caught instanceof Error ? caught.message : "board write failed",
    })
  }
})
