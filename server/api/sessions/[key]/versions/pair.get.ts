import type { DiffTarget, VersionPair } from "~~/shared/types/versions"
import { Versions } from "~~/server/utils/sessions/versions"

function targetOf(raw: unknown): DiffTarget {
  if (raw === "head" || raw === "next") return raw
  return Number(raw) || 0
}

export default defineEventHandler((event): Promise<VersionPair> => {
  const key = getRouterParam(event, "key") || ""
  const { path, from, to } = getQuery(event)
  const target = targetOf(to)
  if (typeof path !== "string" || !path) return Promise.resolve({ path: "", from: 0, to: target, computed: false, reason: "missing-content" })
  return Versions.pair({ key, path, from: Number(from) || 0, to: target })
})
