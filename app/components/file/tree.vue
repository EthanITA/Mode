<script lang="ts" setup>
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "@lucide/vue";
import type { TreeSource } from "~/composables/useFileTree";
import type { TreeEntry } from "~~/shared/types/tree";

type Row =
  | { kind: "entry"; entry: TreeEntry; depth: number; isOpen: boolean }
  | { kind: "loading"; key: string; depth: number };

const {
  source,
  selected,
  isOpenByDefault = false,
  toneOf,
} = defineProps<{
  source: TreeSource;
  selected?: string;
  /** Review opens everything; a whole folder opens one level at a time. */
  isOpenByDefault?: boolean;
  /** A word the row is coloured by, such as `added`, `modified` or `deleted`. */
  toneOf?: (entry: TreeEntry) => string | undefined;
}>();

defineEmits<{ select: [path: string] }>();
defineSlots<{ trailing?: (props: { entry: TreeEntry }) => unknown }>();

// What the person flipped from the default, so a new folder still opens or stays shut as the tree says.
const flipped = ref(new Set<string>());

function isOpen(dir: string): boolean {
  return isOpenByDefault !== flipped.value.has(dir);
}

function toggle(dir: string): void {
  const next = new Set(flipped.value);
  if (next.has(dir)) next.delete(dir);
  else next.add(dir);
  flipped.value = next;
  if (isOpen(dir)) source.open(dir);
}

const rows = computed<Row[]>(() => {
  const root = source.root.value;
  if (!root) return [];
  const out: Row[] = [];
  const walk = (dir: string, depth: number): void => {
    const children = source.childrenOf(dir);
    if (!children) {
      out.push({ kind: "loading", key: `${dir}:loading`, depth });
      return;
    }
    for (const entry of children) {
      const open = entry.kind === "dir" && isOpen(entry.path);
      out.push({ kind: "entry", entry, depth, isOpen: open });
      if (open) walk(entry.path, depth + 1);
    }
  };
  walk(root, 0);
  return out;
});

// A folder shown open has to have its listing asked for, whether it opened by default or by a click.
watchEffect(() => {
  const root = source.root.value;
  if (!root) return;
  source.open(root);
  for (const row of rows.value) if (row.kind === "entry" && row.isOpen) source.open(row.entry.path);
});
</script>

<template>
  <ul class="tree" role="tree" data-region="file-tree">
    <li
      v-for="row in rows"
      :key="row.kind === 'entry' ? row.entry.path : row.key"
      role="treeitem"
      :aria-expanded="row.kind === 'entry' && row.entry.kind === 'dir' ? row.isOpen : undefined"
    >
      <span v-if="row.kind === 'loading'" class="row loading mono-meta" :style="{ '--depth': row.depth }">Reading…</span>
      <button
        v-else-if="row.entry.kind === 'dir'"
        class="row focusable"
        type="button"
        :style="{ '--depth': row.depth }"
        :data-ignored="!!row.entry.ignored"
        :title="homePath(row.entry.path)"
        @click="toggle(row.entry.path)"
      >
        <UiIcon class="chevron" :icon="row.isOpen ? ChevronDown : ChevronRight" size="xs" />
        <UiIcon class="folder" :icon="row.isOpen ? FolderOpen : Folder" size="sm" />
        <span class="name">{{ row.entry.name }}</span>
        <slot name="trailing" :entry="row.entry" />
      </button>
      <button
        v-else
        class="row focusable"
        type="button"
        :style="{ '--depth': row.depth }"
        :data-ignored="!!row.entry.ignored"
        :data-selected="row.entry.path === selected"
        :data-tone="toneOf?.(row.entry) ?? 'plain'"
        :title="homePath(row.entry.path)"
        @click="$emit('select', row.entry.path)"
      >
        <span class="chevron" />
        <UiIcon class="icon" :icon="File" size="sm" />
        <span class="name">{{ row.entry.name }}</span>
        <slot name="trailing" :entry="row.entry" />
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

.row[data-ignored="true"] {
  opacity: 0.55;
}

.loading {
  color: var(--subtle);
  cursor: default;
  padding-left: calc(26px + var(--depth) * 14px);
  text-transform: none;
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

/* JetBrains' colours for a change: added green, modified blue, deleted grey. */
.row[data-tone="added"] .name {
  color: var(--success);
}

.row[data-tone="modified"] .name {
  color: var(--info);
}

.row[data-tone="deleted"] .name {
  color: var(--subtle);
  text-decoration: line-through;
}
</style>
