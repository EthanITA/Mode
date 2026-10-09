import type { ReviewAction, ReviewActionReply } from "~~/shared/types/review"
import { deliver } from "~~/server/utils/sessions/inbox"

const isPath = (value: unknown): value is string => typeof value === "string" && value.startsWith("/")
const isPaths = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(isPath)
const isLines = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((n) => Number.isInteger(n) && n > 0)

function actionOf(raw: unknown): ReviewAction | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const body = raw as Record<string, unknown>
  if (body.do === "approve" || body.do === "reject") return isPaths(body.paths) ? { do: body.do, paths: body.paths } : undefined
  if (body.do !== "accept-lines" && body.do !== "reject-lines") return undefined
  if (!isPath(body.path) || !isLines(body.old) || !isLines(body.new) || !(body.old.length + body.new.length)) return undefined
  return { do: body.do, path: body.path, old: body.old, new: body.new }
}

// The mod in that session runs the action and consumes the message, so Claude never reads the JSON.
export default defineEventHandler(async (event): Promise<ReviewActionReply> => {
  const key = getRouterParam(event, "key") || ""
  const action = actionOf(await readBody(event))
  if (!key || !action) return { delivered: false, reason: "bad-action" }
  const sent = await deliver({ key, text: `[[turn-diff v1]] ${JSON.stringify(action)}` })
  return sent.delivered ? { delivered: true } : sent
})
