import { readTextSafe } from "~~/server/utils/mode/fsutil"
import { keyFileOf, sendToInbox } from "~~/server/utils/sessions/inbox"
import { keyOf } from "~~/server/utils/sessions/paths"
import { liveEntries } from "~~/server/utils/sessions/registry"

type MessageResponse =
  | { delivered: true; session: string }
  | { delivered: false; reason: "no-live-session" | "refused-by-inbox" }

type MessageBody = { text: string; slug?: string }

function payloadOf(raw: unknown): MessageBody | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const record = raw as Record<string, unknown>
  const text = record.text
  if (typeof text !== "string" || !text) return undefined
  const slug = record.slug
  return { text, slug: typeof slug === "string" && slug ? slug : undefined }
}

export default defineEventHandler(async (event): Promise<MessageResponse> => {
  const key = getRouterParam(event, "key") || ""
  const body = payloadOf(await readBody(event))
  if (!key || !body) return { delivered: false, reason: "refused-by-inbox" }

  const [entry] = liveEntries()
    .filter((one) => keyOf(one.id) === key)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  if (!entry) return { delivered: false, reason: "no-live-session" }

  const token = readTextSafe(keyFileOf(entry.pid))?.trim()
  if (!entry.messagingSocketPath || !token) return { delivered: false, reason: "refused-by-inbox" }

  const result = await sendToInbox({ socketPath: entry.messagingSocketPath, token, text: body.text, slug: body.slug })
  if (!result.ok) return { delivered: false, reason: "refused-by-inbox" }
  return { delivered: true, session: keyOf(entry.id) }
})
