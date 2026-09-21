import { getArtifact } from "../../utils/artifacts"
import type { ArtifactDetail } from "../../../shared/types/artifact"

export default defineEventHandler(async (event): Promise<ArtifactDetail> => {
  const slug = getRouterParam(event, "slug")
  if (!slug) throw createError({ statusCode: 400, statusMessage: "missing slug" })

  const artifact = await getArtifact(slug)
  if (!artifact) throw createError({ statusCode: 404, statusMessage: `no artifact matching '${slug}'` })
  return artifact
})
