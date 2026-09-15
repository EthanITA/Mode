import { readArtifact, stripReviewLayer } from "../../utils/artifacts"
import { Markdown } from "../../utils/markdown"
import { Versions } from "../../utils/sessions/versions"

export default defineEventHandler(async (event): Promise<string> => {
  const slug = getRouterParam(event, "slug")
  if (!slug) throw createError({ statusCode: 400, statusMessage: "missing slug" })

  const source = await readArtifact(slug)
  if (!source) throw createError({ statusCode: 404, statusMessage: `no artifact matching '${slug}'` })

  setResponseHeader(event, "content-type", "text/html; charset=utf-8")
  // The file on disk is rewritten by every rebuild, so a cached frame would show a stale page.
  setResponseHeader(event, "cache-control", "no-store")
  if (source.format === "html") return stripReviewLayer(source.text)

  // A stored markdown version is raw text, so the read view asks this route to render it rather than using srcdoc.
  const { session, turn } = getQuery(event)
  const at = Number(turn) || 0
  if (typeof session !== "string" || !session || !at) {
    return Markdown.page({ ds: source.ds, markdown: source.text, title: source.title || slug })
  }
  const stored = await Versions.content({ key: session, path: source.path, turn: at })
  if (!stored.found) throw createError({ statusCode: 404, statusMessage: `no version t${at} of '${slug}'` })
  return Markdown.page({ ds: source.ds, markdown: stored.content, title: source.title || slug })
})
