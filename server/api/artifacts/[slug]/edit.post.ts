import {
  applyArtifactEdit,
  readArtifactHtml,
  resolveArtifactEdit,
  writeArtifactHtml,
  type ArtifactEditFail,
} from "~~/server/utils/artifacts"
import type { ArtifactEditReply, ArtifactEditRequest } from "~~/shared/types/artifact"

function payloadOf(raw: unknown): ArtifactEditRequest | undefined {
  if (typeof raw !== "object" || !raw) return undefined
  const record = raw as Record<string, unknown>
  const path = typeof record.path === "string" ? record.path : ""
  if (!path.trim()) return undefined
  const action = record.action
  if (action === "accept" || action === "revert") {
    const id = typeof record.id === "string" ? record.id : ""
    if (!id.trim()) return undefined
    return { action, id, path }
  }
  if (action === "apply" || !action) {
    const replacement = typeof record.replacement === "string" ? record.replacement : ""
    const selection = typeof record.selection === "string" ? record.selection : ""
    if (!replacement || !selection.trim()) return undefined
    return { action: "apply", path, replacement, selection }
  }
  return undefined
}

function failMessage(reason: ArtifactEditFail): string {
  if (reason === "ambiguous") return "That path matches more than one element"
  if (reason === "stale") return "The element's text has changed"
  if (reason === "not-found") return "That element is not on the page"
  return "invalid edit"
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
      ? resolveArtifactEdit({ action: body.action, html, id: body.id || "", path: body.path })
      : applyArtifactEdit({ html, path: body.path, replacement: body.replacement || "", selection: body.selection || "" })

  if (!outcome.ok) {
    throw createError({
      statusCode: outcome.reason === "invalid" ? 400 : 409,
      statusMessage: failMessage(outcome.reason),
    })
  }

  if (!(await writeArtifactHtml(slug, outcome.html))) {
    throw createError({ statusCode: 404, statusMessage: `no artifact matching '${slug}'` })
  }

  return { id: outcome.id }
})
