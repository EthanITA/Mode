<script lang="ts" setup>
import { File as FileIcon } from "@lucide/vue";
import type { Turn } from "~/utils/turns";

const {
  turn,
  isPicked = false,
  inView,
  now,
} = defineProps<{ turn: Turn; isPicked?: boolean; inView?: string; now: number }>();
const emit = defineEmits<{ pick: []; file: [path: string] }>();

const age = computed(() => relativeAge(new Date(turn.at).toISOString(), now));
const ask = computed(() => (turn.isOpen ? `Agents kept working after turn ${turn.turn - 1}` : (turn.prompt ?? "")));

const tell = computed(() => {
  const what = turn.files.length ? `which changed ${plural(turn.files.length, "file")}` : "which changed no files";
  return `About ${turn.isOpen ? `the work after turn ${turn.turn - 1}` : `turn ${turn.turn}`}, ${what}:`;
});
</script>

<template>
  <div class="row" :data-picked="isPicked" :data-open="turn.isOpen">
    <button
      v-press
      class="turn focusable plain-button"
      type="button"
      :aria-current="isPicked"
      data-cmt="turn"
      :data-cmt-label="turn.isOpen ? 'Agents after the session' : `Turn ${turn.turn}`"
      :data-cmt-tell="tell"
      :data-cmt-excerpt="turn.prompt"
      @click="emit('pick')"
    >
      <span class="number mono-meta">{{ turn.isOpen ? "" : turn.turn }}</span>
      <span class="body">
        <span class="ask">{{ ask }}</span>
        <HistoryMeta :turn="turn" has-agents />
      </span>
      <span class="age mono-meta">{{ age }}</span>
    </button>

    <div v-if="isPicked && turn.files.length" class="files">
      <button
        v-for="file in turn.files"
        :key="file.path"
        class="file focusable plain-button"
        type="button"
        :data-kind="file.kind"
        :data-in-view="file.path === inView"
        :title="homePath(file.path)"
        @click="emit('file', file.path)"
      >
        <UiIcon class="icon" :icon="FileIcon" size="xs" />
        <span class="name">{{ file.name }}</span>
        <span v-if="file.churn" class="churn mono-meta">
          <span data-tone="add">+{{ file.churn.added }}</span>
          <span data-tone="remove">−{{ file.churn.removed }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.row {
  border: 1px solid transparent;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row[data-picked="true"] {
  background: var(--sunken);
  border-color: var(--border-strong);
  padding-bottom: 8px;
}

.turn {
  align-items: start;
  border-radius: 10px;
  column-gap: 8px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  padding: 10px 8px 10px 6px;
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-out);
  width: 100%;
}

.row[data-picked="true"] .turn {
  padding-bottom: 0;
}

@media (hover: hover) and (pointer: fine) {
  .row:not([data-picked="true"]) .turn:hover {
    background: var(--sunken);
  }
}

.number {
  color: var(--subtle);
  font-size: 11px;
  letter-spacing: 0;
  padding-top: 2px;
  text-align: right;
}

.row[data-picked="true"] .number {
  color: var(--primary);
  font-weight: 600;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ask {
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--ink);
  display: -webkit-box;
  font-size: 13px;
  line-height: 1.45;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-line;
}

.row[data-picked="true"] .ask {
  -webkit-line-clamp: unset;
  text-wrap: pretty;
}

.row[data-open="true"] .ask {
  color: var(--muted);
}

.age {
  color: var(--subtle);
  padding-top: 2px;
  text-transform: none;
  white-space: nowrap;
}

.files {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0 8px 0 36px;
}

.file {
  align-items: center;
  border-radius: 6px;
  display: flex;
  gap: 6px;
  min-height: 26px;
  padding: 0 8px 0 6px;
  text-align: left;
}

.file[data-in-view="true"] {
  background: var(--primary-soft);
}

@media (hover: hover) and (pointer: fine) {
  .file:hover {
    background: var(--primary-soft);
  }
}

.icon {
  color: var(--subtle);
  flex: none;
}

.name {
  color: var(--info);
  flex: 1;
  font-family: var(--mono);
  font-size: 12.5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file[data-kind="created"] .name {
  color: var(--success);
}

.file[data-kind="deleted"] .name {
  color: var(--error);
}

.file[data-kind="unchanged"] .name {
  color: var(--muted);
}

.churn {
  display: inline-flex;
  flex: none;
  gap: 5px;
}

[data-tone="add"] {
  color: var(--success);
}

[data-tone="remove"] {
  color: var(--error);
}
</style>
