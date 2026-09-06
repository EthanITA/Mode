import { readTextSafe } from "~~/server/utils/mode/fsutil"
import { keyFileOf, sendToInbox } from "~~/server/utils/sessions/inbox"
import { keyOf } from "~~/server/utils/sessions/paths"
import { liveEntries } from "~~/server/utils/sessions/registry"

type MessageResponse =
  | { delivered: true; session: string }
  | { delivered: false; reason: "no-live-session" | "refused-by-inbox" }

function payloadOf(raw: unknown): { text: string } | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const text = (raw as Record<string, unknown>).text
  return typeof text === "string" && text ? { text } : undefined
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

  const result = await sendToInbox({ socketPath: entry.messagingSocketPath, token, text: body.text })
  if (!result.ok) return { delivered: false, reason: "refused-by-inbox" }
  return { delivered: true, session: keyOf(entry.id) }
})
