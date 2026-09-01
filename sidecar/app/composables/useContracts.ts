import type { Contracts } from "~~/shared/types/mode"

export function useContracts(): ReturnType<typeof useFetch<Contracts>> {
  return useFetch<Contracts>("/api/contracts")
}
