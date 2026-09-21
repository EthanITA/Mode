import { listArtifacts } from "../../utils/artifacts"
import type { ArtifactMeta } from "../../../shared/types/artifact"

export default defineEventHandler(async (): Promise<ArtifactMeta[]> => {
  return listArtifacts()
})
