<script lang="ts" setup>
const { path, state } = defineProps<{ path: string; state: DiffState }>();

const rows = computed(() => (state.kind === "changed" ? state.rows : []));
const note = computed(() => Diff.stateNote(state));
const lang = computed(() => Syntax.languageOf(path));
const highlighted = useHighlightedRows(rows, lang);
</script>

<template>
  <div class="diff">
    <div v-if="rows.length" class="rows">
      <p v-for="(row, index) in rows" :key="index" class="row" :data-kind="row.kind">
        <span class="mark" aria-hidden="true" />
        <span class="code" v-html="highlighted[index] ?? ''" />
      </p>
    </div>

    <p v-if="note" class="note" :data-tone="note.tone">{{ note.text }}</p>
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
  @apply text-center font-mono typo-meta-semibold leading-[1.7];
}

.code {
  @apply min-w-0 font-mono text-[12px] leading-[1.7] break-normal wrap-anywhere whitespace-pre-wrap;
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
  @apply text-[11px] text-subtle;
}

.note[data-tone="loud"] {
  @apply m-0 border-l-3 border-l-warning bg-warning-soft px-3 py-2.5 text-[12.5px] leading-normal font-medium text-warning;
}

.note[data-tone="quiet"] {
  @apply m-0 px-3 py-2.5 font-mono text-[11px] leading-normal text-muted;
}
</style>
