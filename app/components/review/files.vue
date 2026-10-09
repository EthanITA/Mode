<script lang="ts" setup>
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "@lucide/vue";
import type { ReviewFile } from "~~/shared/types/review";

const review = useReview();
const collapsed = useState<string[]>("rv:collapsed", () => []);

const rows = computed(() => Review.tree({ files: review.snapshot.value?.files ?? [], collapsed: collapsed.value }));

// JetBrains' colours for a change: added green, modified blue, deleted grey.
function statusOf(file: ReviewFile): "added" | "modified" | "deleted" {
  if (file.isDeleted) return "deleted";
  return file.isNew ? "added" : "modified";
}

function toggle(key: string): void {
  collapsed.value = collapsed.value.includes(key) ? collapsed.value.filter((one) => one !== key) : [...collapsed.value, key];
}
</script>

<template>
  <ul class="tree" role="tree" data-region="review-files-list">
    <li v-for="row in rows" :key="row.key" role="treeitem" :aria-expanded="row.kind === 'dir' ? row.isOpen : undefined">
      <button
        v-if="row.kind === 'dir'"
        class="row focusable"
        type="button"
        :style="{ '--depth': row.depth }"
        :title="row.depth ? row.name : homePath(row.name)"
        @click="toggle(row.key)"
      >
        <UiIcon class="chevron" :icon="row.isOpen ? ChevronDown : ChevronRight" size="xs" />
        <UiIcon class="folder" :icon="row.isOpen ? FolderOpen : Folder" size="sm" />
        <span class="name">{{ row.depth ? row.name : homePath(row.name) }}</span>
        <span class="count mono-meta">{{ plural(row.count, "file") }}</span>
      </button>
      <button
        v-else
        class="row focusable"
        type="button"
        :style="{ '--depth': row.depth }"
        :data-selected="row.file.path === review.file.value?.path"
        :data-status="statusOf(row.file)"
        :title="homePath(row.file.path)"
        @click="review.selected.value = row.file.path"
      >
        <span class="chevron" />
        <UiIcon class="icon" :icon="File" size="sm" />
        <span class="name">{{ row.name }}</span>
        <span class="turns mono-meta">{{ row.file.turns.map((turn) => `T${turn}`).join(" ") }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  align-items: center;
  background: none;
  border: 0;
  border-radius: 6px;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 12.5px;
  gap: 5px;
  min-height: 26px;
  padding: 0 8px 0 calc(6px + var(--depth) * 14px);
  text-align: left;
  width: 100%;
}

.row:hover {
  background: var(--sunken);
}

.row[data-selected="true"] {
  background: var(--primary-soft);
}

.chevron {
  color: var(--subtle);
  flex: none;
  width: 14px;
}

.folder {
  color: var(--warning);
  flex: none;
}

.icon {
  color: var(--subtle);
  flex: none;
}

.name {
  flex: 1;
  font-family: var(--mono);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row[data-status="added"] .name {
  color: var(--success);
}

.row[data-status="modified"] .name {
  color: var(--info);
}

.row[data-status="deleted"] .name {
  color: var(--subtle);
  text-decoration: line-through;
}

.count,
.turns {
  color: var(--subtle);
  flex: none;
  text-transform: none;
}
</style>
