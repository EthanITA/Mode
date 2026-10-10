<script lang="ts" setup>
import { Check, X } from "@lucide/vue";
import type { ReviewRowRejected } from "~/utils/review";
import type { TreeEntry } from "~~/shared/types/tree";

const review = useReview();
const emit = defineEmits<{ rejected: [at: ReviewRowRejected] }>();

const byPath = computed(() => new Map((review.snapshot.value?.files ?? []).map((file) => [file.path, file])));
const tree = usePathsTree(() => [...byPath.value.keys()]);
const isIdle = computed(() => !!review.snapshot.value?.live && !review.busy.value);

function toneOf(entry: TreeEntry): string | undefined {
  const file = byPath.value.get(entry.path);
  if (!file) return undefined;
  if (file.isDeleted) return "deleted";
  return file.isNew ? "added" : "modified";
}

function countOf(path: string): number {
  return Review.under(review.snapshot.value?.files ?? [], path).length;
}

function whatOf(entry: TreeEntry): string {
  return entry.kind === "dir" ? `the ${plural(countOf(entry.path), "file")} in ${entry.name}/` : entry.name;
}

// The first press only arms, so the composer waits for the one that rejects.
function reject(event: MouseEvent, path: string): void {
  const isConfirmed = review.confirming.value === path;
  const count = countOf(path);
  void review.decideUnder(path, false);
  if (isConfirmed) emit("rejected", { event, path, count });
}
</script>

<template>
  <div data-region="review-files-list">
    <FileTree
      :key="review.snapshot.value?.key"
      has-guides
      is-open-by-default
      :pinned="review.confirming.value"
      :selected="review.file.value?.path"
      :source="tree"
      :tone-of="toneOf"
      @select="review.selected.value = $event"
    >
      <template #actions="{ entry }">
        <span class="pill" :data-armed="review.confirming.value === entry.path">
          <span v-if="entry.kind === 'dir' && review.confirming.value !== entry.path" class="count mono-meta">{{
            countOf(entry.path)
          }}</span>
          <button
            class="dot focusable"
            type="button"
            data-tone="accept"
            :aria-label="`Approve ${whatOf(entry)}`"
            :data-tip="`Approve ${whatOf(entry)}`"
            :disabled="!isIdle"
            @click="review.decideUnder(entry.path, true)"
          >
            <UiIcon :icon="Check" size="xs" />
          </button>
          <span v-if="review.confirming.value === entry.path" class="ask">
            Reject {{ entry.kind === "dir" ? countOf(entry.path) : "it" }}?
          </span>
          <button
            class="dot focusable"
            type="button"
            data-tone="reject"
            :aria-label="`${review.confirming.value === entry.path ? 'Press again to reject' : 'Reject'} ${whatOf(entry)}`"
            :data-tip="review.confirming.value === entry.path ? 'Press again to reject' : 'Reject, then say why'"
            :disabled="!isIdle"
            @click="reject($event, entry.path)"
          >
            <UiIcon :icon="X" size="xs" />
          </button>
        </span>
      </template>
    </FileTree>
  </div>
</template>

<style scoped>
/* The hunk seam's pill, in the tree's light surface. */
.pill {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  display: inline-flex;
  gap: 1px;
  padding: 1px;
}

.pill[data-armed="true"] {
  background: var(--error-soft);
  border-color: var(--error);
}

.count {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  padding: 0 4px 0 6px;
  text-transform: none;
}

.ask {
  color: var(--error);
  font-size: 10.5px;
  font-weight: 600;
  padding: 0 2px 0 4px;
  white-space: nowrap;
}

.dot {
  align-items: center;
  background: none;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: grid;
  height: 16px;
  justify-items: center;
  padding: 0;
  width: 20px;
}

.pill[data-armed="true"] .dot[data-tone="reject"] {
  background: var(--error-soft);
  color: var(--error);
}

@media (hover: hover) and (pointer: fine) {
  .dot[data-tone="accept"]:hover:not(:disabled) {
    background: var(--success-soft);
    color: var(--success);
  }

  .dot[data-tone="reject"]:hover:not(:disabled) {
    background: var(--error-soft);
    color: var(--error);
  }
}

.dot:disabled {
  cursor: progress;
  opacity: 0.5;
}
</style>
