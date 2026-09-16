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
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.rows {
  display: flex;
  flex-direction: column;
  max-height: var(--transcript-max-h);
  overflow-y: auto;
  padding: 6px 0;
  scrollbar-width: thin;
}

.row {
  display: grid;
  gap: 8px;
  grid-template-columns: 22px minmax(0, 1fr);
  margin: 0;
  padding: 1px 12px 1px 0;
}

.mark {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.7;
  text-align: center;
}

.code {
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.7;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.row[data-kind="add"] {
  background: var(--success-soft);
}

.row[data-kind="add"] .mark {
  color: var(--success);
}

.row[data-kind="add"] .mark::before {
  content: "+";
}

.row[data-kind="remove"] {
  background: var(--error-soft);
}

.row[data-kind="remove"] .mark {
  color: var(--error);
}

.row[data-kind="remove"] .mark::before {
  content: "−";
}

.row[data-kind="context"] .code {
  color: var(--muted);
}

.row[data-kind="hunk"] {
  border-top: 1px solid var(--border);
  margin-top: 4px;
  padding-top: 4px;
}

.row[data-kind="hunk"] .code {
  color: var(--subtle);
  font-size: 11px;
}

.note[data-tone="loud"] {
  background: var(--warning-soft);
  border-left: 3px solid var(--warning);
  color: var(--warning);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.5;
  margin: 0;
  padding: 10px 12px;
}

.note[data-tone="quiet"] {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
  padding: 10px 12px;
}
</style>
