<script lang="ts" setup>
import type { Compare, HistoryFile } from "~/composables/useHistory";

const { file, compare, restoring = false } = defineProps<{ file: HistoryFile; compare: Compare; restoring?: boolean }>();
defineEmits<{ restore: [] }>();

const baseline = computed(() => Diff.baselineNote(file.baseline));
const note = computed(() => Diff.stateNote(file.state));
const rows = computed(() => (file.state.kind === "changed" ? file.state.rows : []));
const churn = computed(() => (file.state.kind === "changed" ? file.state : undefined));
const against = computed(() => (compare === "head" ? "against the newest version" : "against the next version"));
</script>

<template>
  <article class="file" :data-state="file.state.kind">
    <header class="head">
      <span class="name">{{ file.name }}</span>
      <span v-if="churn" class="churn mono-meta">
        <span data-mark="add">+{{ churn.added }}</span>
        <span data-mark="remove">−{{ churn.removed }}</span>
      </span>
      <!-- Attribution belongs on the row that claims the work, not only on the turn. -->
      <span v-if="file.by" class="by mono-meta">{{ authorOf(file.by) }}</span>
      <span class="against mono-meta">{{ against }}</span>
      <span class="spacer" />
      <button v-press class="restore focusable" type="button" :disabled="restoring" @click="$emit('restore')">
        {{ restoring ? "Restoring…" : "Restore" }}
      </button>
    </header>

    <p v-if="baseline" class="note" :data-tone="baseline.tone">{{ baseline.text }}</p>

    <div v-if="rows.length" class="rows">
      <p v-for="(row, index) in rows" :key="index" class="row" :data-kind="row.kind">
        <span class="mark" aria-hidden="true" />
        <span class="code">{{ row.text }}</span>
      </p>
    </div>

    <p v-if="note" class="note" :data-tone="note.tone">{{ note.text }}</p>

    <p class="path mono-meta">{{ homePath(file.path) }}</p>
  </article>
</template>

<style scoped>
.file {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

/* A card whose history we could not reconstruct is marked as a whole, not only in its body.
   Warning, not error: an unrecoverable baseline is a gap in what we know, not a failure. */
.file[data-state="unknown"] {
  border-color: var(--warning);
}

.head {
  align-items: center;
  background: var(--sunken);
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 9px 12px;
}

.name {
  color: var(--ink);
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.churn {
  display: inline-flex;
  gap: 6px;
  text-transform: none;
}

.churn [data-mark="add"] {
  color: var(--success);
}

.churn [data-mark="remove"] {
  color: var(--error);
}

.by {
  background: var(--primary-soft);
  border-radius: 999px;
  color: var(--primary-deep);
  padding: 2px 7px;
  text-transform: none;
}

.against,
.path {
  color: var(--subtle);
  text-transform: none;
}

.restore {
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  flex: none;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
}

.restore:hover:not(:disabled) {
  border-color: var(--ink);
}

.restore:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.rows {
  display: flex;
  flex-direction: column;
  padding: 6px 0;
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

/* The whole point of the domain: a gap we could not fill never renders as a quiet nothing. */
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

.path {
  border-top: 1px solid var(--border);
  margin: 0;
  overflow: hidden;
  padding: 6px 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
