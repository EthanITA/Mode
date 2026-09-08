import { applyArtifactEdit, readArtifactHtml, resolveArtifactEdit, writeArtifactHtml } from "~~/server/utils/artifacts"
import type { ArtifactEditReply, ArtifactEditRequest } from "~~/shared/types/artifact"

function payloadOf(raw: unknown): ArtifactEditRequest | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const record = raw as Record<string, unknown>
  const selection = typeof record.selection === "string" ? record.selection : ""
  if (!selection.trim()) return undefined
  const action = record.action
  if (action === "accept" || action === "revert") return { action, selection }
  if (action === "apply" || !action) {
    const replacement = typeof record.replacement === "string" ? record.replacement : ""
    if (!replacement) return undefined
    const block = typeof record.block === "string" && record.block ? record.block : undefined
    return { action: "apply", block, replacement, selection }
  }
  return undefined
}

export default defineEventHandler(async (event): Promise<ArtifactEditReply> => {
  const slug = getRouterParam(event, "slug")
  if (!slug) throw createError({ statusCode: 400, statusMessage: "missing slug" })

  const body = payloadOf(await readBody(event))
  if (!body) throw createError({ statusCode: 400, statusMessage: "invalid edit" })

  const html = await readArtifactHtml(slug)
  if (!html) throw createError({ statusCode: 404, statusMessage: `no artifact matching '${slug}'` })

  const outcome =
    body.action === "accept" || body.action === "revert"
      ? resolveArtifactEdit({ action: body.action, html, selection: body.selection })
      : applyArtifactEdit({ block: body.block, html, replacement: body.replacement || "", selection: body.selection })

  if (!outcome.ok) {
    throw createError({
      statusCode: outcome.reason === "invalid" ? 400 : 409,
      statusMessage: outcome.reason,
    })
  }

  if (!(await writeArtifactHtml(slug, outcome.html))) {
    throw createError({ statusCode: 404, statusMessage: `no artifact matching '${slug}'` })
  }

  return { id: outcome.id }
})
