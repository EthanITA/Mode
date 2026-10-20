<script lang="ts" setup>
import { useEventListener } from "@vueuse/core";
import type { CommentOffer } from "~/composables/useChrome";
import { selectionIn } from "~~/lib/web/page/blocks";

const { path, state } = defineProps<{ path: string; state: DiffState }>();

const chrome = useChrome();
const list = useTemplateRef<HTMLElement>("list");
const rows = computed(() => (state.kind === "changed" ? state.rows : []));
const note = computed(() => Diff.stateNote(state));
const lang = computed(() => Syntax.languageOf(path));
const highlighted = useHighlightedRows(rows, lang);

let offered: CommentOffer | undefined;

function withdraw(): void {
  chrome.comment.withdraw(offered);
  offered = undefined;
}

// A past version has nowhere to show an answer, so the chip offers a note for the session.
function offer(): void {
  withdraw();
  const selection = selectionIn(document);
  if (!selection?.block || !list.value?.contains(selection.block)) return;
  offered = {
    end: selection.end,
    spot: {
      excerpt: selection.quote,
      file: path,
      kind: "selection",
      label: basename(path),
      quote: selection.quote,
      tell: `About this version's diff of ${path}:`,
      x: 0,
      y: 0,
    },
  };
  chrome.comment.offer(offered);
}

function onRelease(): void {
  requestAnimationFrame(offer);
}

function onScroll(): void {
  if (offered) offer();
}

useEventListener(document, "selectionchange", () => {
  if (offered && document.getSelection()?.isCollapsed !== false) withdraw();
});
onBeforeUnmount(withdraw);
</script>

<template>
  <div class="diff">
    <div v-if="rows.length" ref="list" class="rows" @keyup="offer" @pointerup="onRelease" @scroll.passive="onScroll">
      <p v-for="(row, index) in rows" :key="index" class="row" :data-kind="row.kind">
        <span class="mark" aria-hidden="true" />
        <span class="code" v-html="highlighted[index] ?? ''" />
      </p>
    </div>

    <UiSurface v-if="note?.tone === 'loud'" class="loud" pad="xs" tone="warning" variant="banner">
      {{ note.text }}
    </UiSurface>
    <p v-else-if="note" class="note">{{ note.text }}</p>
  </div>
</template>

<style scoped>
.diff {
  @apply overflow-hidden rounded-xl border border-border bg-raised;
}

.rows {
  @apply flex max-h-(--transcript-max-h) scrollbar-thin flex-col overflow-y-auto px-0 py-1.5;
}

.row {
  @apply m-0 grid grid-cols-[22px_minmax(0,1fr)] gap-2 py-px pr-3 pl-0;
}

.mark {
  @apply text-center font-mono typo-meta-semibold leading-relaxed;
}

.code {
  @apply min-w-0 font-mono typo-caption leading-relaxed break-normal wrap-anywhere whitespace-pre-wrap;
}

.row[data-kind="add"] {
  @apply bg-success-soft;
}

.row[data-kind="add"] .mark {
  @apply text-success;
}

.row[data-kind="add"] .mark::before {
  @apply content-['+'];
}

.row[data-kind="remove"] {
  @apply bg-error-soft;
}

.row[data-kind="remove"] .mark {
  @apply text-error;
}

.row[data-kind="remove"] .mark::before {
  @apply content-['−'];
}

.row[data-kind="context"] .code {
  @apply text-muted;
}

.row[data-kind="hunk"] {
  @apply mt-1 border-t border-t-border pt-1;
}

.row[data-kind="hunk"] .code {
  @apply typo-meta text-subtle;
}

.loud {
  @apply m-2 typo-body-medium;
}

.note {
  @apply m-0 px-3 py-2.5 typo-mono-meta leading-normal text-muted;
}
</style>
