import { applyReviewChange, readArtifactHtml, writeArtifactHtml } from "~~/server/utils/artifacts"
import type { ArtifactReviewReply, ArtifactReviewRequest, ThreadAnchor } from "~~/shared/types/artifact"

function anchorOf(raw: unknown): ThreadAnchor | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const rec = raw as Record<string, unknown>
  const label = typeof rec.label === "string" ? rec.label : undefined
  const quote = typeof rec.quote === "string" ? rec.quote : undefined
  const sel = typeof rec.sel === "string" ? rec.sel : undefined
  const text = typeof rec.text === "string" ? rec.text : undefined
  return label || quote || sel || text ? { label, quote, sel, text } : undefined
}

function payloadOf(raw: unknown): ArtifactReviewRequest | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const rec = raw as Record<string, unknown>
  const action = rec.action
  if (action !== "create" && action !== "reply" && action !== "resolve") return undefined
  const id = typeof rec.id === "string" && rec.id ? rec.id : undefined
  const body = typeof rec.body === "string" ? rec.body : undefined
  const by = typeof rec.by === "string" && rec.by ? rec.by : undefined
  if (action === "create") return { action, anchor: anchorOf(rec.anchor), body }
  if (action === "reply") return { action, body, by, id }
  return { action, id }
}

export default defineEventHandler(async (event): Promise<ArtifactReviewReply> => {
  const slug = getRouterParam(event, "slug")
  if (!slug) throw createError({ statusCode: 400, statusMessage: "missing slug" })

  const body = payloadOf(await readBody(event))
  if (!body) throw createError({ statusCode: 400, statusMessage: "invalid review" })

  const html = await readArtifactHtml(slug)
  if (!html) throw createError({ statusCode: 404, statusMessage: `no artifact matching '${slug}'` })

  const outcome = applyReviewChange({ ...body, html })
  if (!outcome.ok) {
    throw createError({
      statusCode: outcome.reason === "invalid" ? 400 : outcome.reason === "no-seed" ? 404 : 409,
      statusMessage: outcome.reason,
    })
  }

  if (!(await writeArtifactHtml(slug, outcome.html))) {
    throw createError({ statusCode: 404, statusMessage: `no artifact matching '${slug}'` })
  }

  return { thread: outcome.thread, threads: outcome.threads }
})
