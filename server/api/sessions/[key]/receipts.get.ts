import type { ReceiptsSlice } from "~~/shared/types/receipts"
import { receiptsOf } from "~~/server/utils/sessions/receipts"

function turnOf(raw: unknown): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== "string" || !value) return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export default defineEventHandler((event): ReceiptsSlice => {
  const key = getRouterParam(event, "key") || ""
  return receiptsOf({ key, afterTurn: turnOf(getQuery(event).afterTurn) })
})
