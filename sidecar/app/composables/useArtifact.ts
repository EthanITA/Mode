import type { ArtifactDetail } from "#shared/types/artifact"

export const useArtifact = (slug: Ref<string | undefined>): {
  artifact: Ref<ArtifactDetail | undefined>
  pending: Ref<boolean>
  error: Ref<unknown>
} => {
  const artifact = ref<ArtifactDetail>()
  const pending = ref(false)
  const error = ref<unknown>()

  watch(
    slug,
    async (value) => {
      if (!value) {
        artifact.value = undefined
        error.value = undefined
        return
      }
      pending.value = true
      error.value = undefined
      try {
        artifact.value = await $fetch<ArtifactDetail>(`/api/artifacts/${encodeURIComponent(value)}`)
      } catch (e) {
        error.value = e
        artifact.value = undefined
      } finally {
        pending.value = false
      }
    },
    { immediate: true },
  )

  return { artifact, pending, error }
}
