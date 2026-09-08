import { readArtifactHtml, stripReviewLayer } from "../../utils/artifacts"

export default defineEventHandler(async (event): Promise<string> => {
  const slug = getRouterParam(event, "slug")
  if (!slug) throw createError({ statusCode: 400, statusMessage: "missing slug" })

  const html = await readArtifactHtml(slug)
  if (!html) throw createError({ statusCode: 404, statusMessage: `no artifact matching '${slug}'` })

  setResponseHeader(event, "content-type", "text/html; charset=utf-8")
  // The file on disk is rewritten by every rebuild, so a cached frame would show a stale page.
  setResponseHeader(event, "cache-control", "no-store")
  return stripReviewLayer(html)
})
