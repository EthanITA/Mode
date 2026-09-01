export const useArtifactSelection = (): Ref<string | undefined> =>
  useState<string | undefined>("artifacts-shelf-selected-slug")
