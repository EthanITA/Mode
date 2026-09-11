import { readTextSafe } from "~~/server/utils/mode/fsutil"
import { artifactsOf, keysWithArtifacts } from "~~/server/utils/sessions/artifact-lists"
import { keyFileOf, sendToInbox } from "~~/server/utils/sessions/inbox"
import { keyOf } from "~~/server/utils/sessions/paths"
import { liveEntries } from "~~/server/utils/sessions/registry"

type Kind = "approval" | "comment"

type MessageBody = {
  slug: string
  kind: Kind
  text: string
}

type MessageResponse =
  | { delivered: true; session: string }
  | { delivered: false; reason: "unknown-slug" | "no-live-session" | "refused-by-inbox" }

function isKind(value: unknown): value is Kind {
  return value === "approval" || value === "comment"
}

function payloadOf(raw: unknown): MessageBody | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const record = raw as Record<string, unknown>
  const slug = typeof record.slug === "string" ? record.slug.trim() : ""
  const text = typeof record.text === "string" ? record.text : ""
  if (!slug || !text || !isKind(record.kind)) return undefined
  return { slug, kind: record.kind, text }
}

export default defineEventHandler(async (event): Promise<MessageResponse> => {
  const body = payloadOf(await readBody(event))
  if (!body) return { delivered: false, reason: "refused-by-inbox" }

  const keys = keysWithArtifacts().filter((key) => artifactsOf(key).includes(body.slug))
  if (!keys.length) return { delivered: false, reason: "unknown-slug" }

  const wanted = new Set(keys)
  const [entry] = liveEntries()
    .filter((one) => wanted.has(keyOf(one.id)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  if (!entry) return { delivered: false, reason: "no-live-session" }

  const token = readTextSafe(keyFileOf(entry.pid))?.trim()
  if (!entry.messagingSocketPath || !token) return { delivered: false, reason: "refused-by-inbox" }

  const result = await sendToInbox({ socketPath: entry.messagingSocketPath, token, text: body.text, slug: body.slug })
  if (!result.ok) return { delivered: false, reason: "refused-by-inbox" }
  return { delivered: true, session: keyOf(entry.id) }
})
