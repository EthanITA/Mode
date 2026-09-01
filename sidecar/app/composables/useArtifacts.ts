import type { ArtifactMeta, ReviewThread } from "#shared/types/artifact"

const threadCounts = (threads: ReviewThread[]): { total: number; open: number } => {
  const total = threads.length
  const open = threads.filter((t) => t.status !== "resolved").length
  return { total, open }
}

export const threadTally = (threads: ReviewThread[]): string => {
  const { total, open } = threadCounts(threads)
  if (!total) return "no notes"
  return open ? `${total} note${total === 1 ? "" : "s"}, ${open} open` : `${total} note${total === 1 ? "" : "s"}, resolved`
}

export const useArtifacts = (): {
  artifacts: ComputedRef<ArtifactMeta[]>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
} => {
  const { data, pending, error, refresh } = useFetch<ArtifactMeta[]>("/api/artifacts")
  return { artifacts: computed(() => data.value ?? []), pending, error, refresh }
}
