<script lang="ts" setup>
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "@lucide/vue";
import type { TreeSource } from "~/composables/useFileTree";
import type { TreeEntry } from "~~/shared/types/tree";

type Row =
  { kind: "entry"; entry: TreeEntry; depth: number; isOpen: boolean } | { kind: "loading"; key: string; depth: number };

const {
  source,
  selected,
  pinned,
  isOpenByDefault = false,
  hasGuides = false,
  toneOf,
} = defineProps<{
  source: TreeSource;
  selected?: string;
  /** The row whose actions stay up without a hover, such as one waiting for a second press. */
  pinned?: string;
  /** A line down the left of each open folder's children. */
  hasGuides?: boolean;
  /** Review opens everything; a whole folder opens one level at a time. */
  isOpenByDefault?: boolean;
  /** A word the row is coloured by, such as `added`, `modified` or `deleted`. */
  toneOf?: (entry: TreeEntry) => string | undefined;
}>();

defineEmits<{ select: [path: string] }>();
defineSlots<{
  trailing?: (props: { entry: TreeEntry }) => unknown;
  actions?: (props: { entry: TreeEntry }) => unknown;
}>();

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
  <ul class="tree" role="tree" data-region="file-tree" :data-guides="hasGuides" :data-actions="!!$slots.actions">
    <li
      v-for="row in rows"
      :key="row.kind === 'entry' ? row.entry.path : row.key"
      class="item"
      role="treeitem"
      :aria-expanded="row.kind === 'entry' && row.entry.kind === 'dir' ? row.isOpen : undefined"
      :data-selected="row.kind === 'entry' && row.entry.path === selected"
    >
      <span v-if="row.kind === 'loading'" class="row loading mono-meta" :style="{ '--depth': row.depth }">
        <span class="reading">Reading…</span>
      </span>
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
      <span v-if="$slots.actions && row.kind === 'entry'" class="actions" :data-pinned="row.entry.path === pinned">
        <slot name="actions" :entry="row.entry" />
      </span>
    </li>
  </ul>
</template>

<style scoped>
.tree {
  @apply m-0 list-none p-0;
}

.tree[data-guides="true"] .row::before {
  @apply pointer-events-none absolute top-0 bottom-0 left-3.25 w-[calc((var(--depth)_-_1)_*_14px_+_1px)] content-[''];
  background: repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px 14px);
}

.row {
  @apply relative flex min-h-6.5 w-full cursor-pointer items-center gap-1.25 rounded-md border-0 bg-transparent bg-none py-0 pr-2 pl-[calc(6px_+_var(--depth)_*_14px)] text-left typo-body text-fg;
}

.item {
  @apply relative;
  --row-bg: var(--raised);
}

.item:hover {
  --row-bg: var(--sunken);
}

.item[data-selected="true"] {
  --row-bg: var(--primary-soft);
}

/* On the item, so the row keeps its hover while the pointer sits on the actions laid over it. */
.item:hover > .row:not([data-selected="true"]) {
  @apply bg-sunken;
}

.row[data-selected="true"] {
  @apply bg-primary-soft;
}

/* Laid over the row's right end, so the slot takes no room at rest and the name runs under it. */
.actions {
  @apply pointer-events-none absolute top-0 right-0 bottom-0 flex items-center rounded-l-none rounded-r-md bg-linear-to-r from-transparent to-(--row-bg) to-[18px] py-0 pr-1 pl-4.5 opacity-0 transition-opacity duration-(--duration-fast) ease-out;
}

.item:hover > .actions,
.item:focus-within > .actions,
.actions[data-pinned="true"] {
  @apply opacity-100;
}

.item:hover > .actions > :slotted(*),
.item:focus-within > .actions > :slotted(*),
.actions[data-pinned="true"] > :slotted(*) {
  @apply pointer-events-auto;
}

@media (hover: none) {
  .actions {
    @apply opacity-100;
  }

  .actions > :slotted(*) {
    @apply pointer-events-auto;
  }
}

.tree[data-actions="true"] .name {
  @apply text-clip;
}

.row[data-ignored="true"] {
  @apply opacity-55;
}

/* The sweep sits on the text, so the row's hover background can't erase it and the band spans only the words. */
.reading {
  @apply shimmer;
}

.loading {
  @apply cursor-default pl-[calc(26px_+_var(--depth)_*_14px)] text-subtle normal-case settle-late;
}

.chevron {
  @apply w-3.5 flex-none text-subtle;
}

.folder {
  @apply flex-none text-warning;
}

.icon {
  @apply flex-none text-subtle;
}

.name {
  @apply min-w-0 flex-1 truncate font-mono;
}

/* JetBrains' colours for a change: added green, modified blue, deleted grey. */
.row[data-tone="added"] .name {
  @apply text-success;
}

.row[data-tone="modified"] .name {
  @apply text-info;
}

.row[data-tone="deleted"] .name {
  @apply text-subtle line-through;
}
</style>
