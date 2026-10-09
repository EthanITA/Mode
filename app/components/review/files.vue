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
      is-open-by-default
      :selected="review.file.value?.path"
      :source="tree"
      :tone-of="toneOf"
      @select="review.selected.value = $event"
    >
      <template #trailing="{ entry }">
        <span class="turns mono-meta">
          {{
            entry.kind === "file"
              ? (byPath.get(entry.path)?.turns ?? []).map((turn) => `T${turn}`).join(" ")
              : plural([...byPath.keys()].filter((path) => path.startsWith(`${entry.path}/`)).length, "file")
          }}
        </span>
      </template>
    </FileTree>
  </div>
</template>

<style scoped>
.turns {
  color: var(--subtle);
  flex: none;
  text-transform: none;
}
</style>
