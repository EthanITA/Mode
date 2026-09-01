import type { SessionSummary } from "~~/shared/types/mode"

export function useSessions(): ReturnType<typeof useFetch<SessionSummary[]>> {
  return useFetch<SessionSummary[]>("/api/sessions")
}
