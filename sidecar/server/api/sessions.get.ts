import { Mode } from "~~/server/utils/mode"
import type { SessionSummary } from "../../shared/types/mode"

export default defineEventHandler((): SessionSummary[] => {
  return Mode.sessions().map((s) => ({ session: s.id, slots: s.slots, pipeline: s.pipeline }))
})
