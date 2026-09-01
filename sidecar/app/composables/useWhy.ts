import type { Why } from "~~/shared/types/mode"

export function useWhy(): ReturnType<typeof useFetch<Why>> {
  return useFetch<Why>("/api/why")
}
