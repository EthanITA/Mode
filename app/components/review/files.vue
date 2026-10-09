<script lang="ts" setup>
import type { TreeEntry } from "~~/shared/types/tree";

const review = useReview();

const byPath = computed(() => new Map((review.snapshot.value?.files ?? []).map((file) => [file.path, file])));
const tree = usePathsTree(() => [...byPath.value.keys()]);

function toneOf(entry: TreeEntry): string | undefined {
  const file = byPath.value.get(entry.path);
  if (!file) return undefined;
  if (file.isDeleted) return "deleted";
  return file.isNew ? "added" : "modified";
}
</script>

<template>
  <div data-region="review-files-list">
    <FileTree
      :key="review.snapshot.value?.key"
      has-guides
      is-open-by-default
      :selected="review.file.value?.path"
      :source="tree"
      :tone-of="toneOf"
      @select="review.selected.value = $event"
    />
  </div>
</template>
