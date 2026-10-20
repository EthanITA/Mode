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
      class="turn plain-button focusable"
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
        class="file plain-button focusable"
        type="button"
        :data-kind="file.kind"
        :data-in-view="file.path === inView"
        :data-tip="homePath(file.path)"
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
  @apply flex flex-col gap-2 rounded-field border border-transparent;
}

.row[data-picked="true"] {
  @apply border-border-strong bg-sunken pb-2;
}

.turn {
  @apply grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-2 rounded-field py-2.5 pr-2 pl-1.5 text-left transition-colors duration-(--duration-fast) ease-out;
}

.row[data-picked="true"] .turn {
  @apply pb-0;
}

@media (hover: hover) and (pointer: fine) {
  .row:not([data-picked="true"]) .turn:hover {
    @apply bg-sunken;
  }
}

.number {
  @apply pt-0.5 text-right typo-meta text-subtle;
}

.row[data-picked="true"] .number {
  @apply font-semibold text-primary;
}

.body {
  @apply flex min-w-0 flex-col gap-1.5;
}

.ask {
  @apply line-clamp-2 typo-body wrap-anywhere whitespace-pre-line text-fg;
}

.row[data-picked="true"] .ask {
  @apply line-clamp-none text-pretty;
}

.row[data-open="true"] .ask {
  @apply text-muted;
}

.age {
  @apply pt-0.5 whitespace-nowrap text-subtle normal-case;
}

.files {
  @apply my-0 mr-2 ml-9 flex flex-col gap-px;
}

.file {
  @apply flex min-h-6.5 items-center gap-1.5 rounded-md py-0 pr-2 pl-1.5 text-left;
}

.file[data-in-view="true"] {
  @apply bg-primary-soft;
}

@media (hover: hover) and (pointer: fine) {
  .file:hover {
    @apply bg-primary-soft;
  }
}

.icon {
  @apply flex-none text-subtle;
}

.name {
  @apply min-w-0 flex-1 truncate font-mono typo-body text-info;
}

.file[data-kind="created"] .name {
  @apply text-success;
}

.file[data-kind="deleted"] .name {
  @apply text-error;
}

.file[data-kind="unchanged"] .name {
  @apply text-muted;
}

.churn {
  @apply inline-flex flex-none gap-1.25;
}

[data-tone="add"] {
  @apply text-success;
}

[data-tone="remove"] {
  @apply text-error;
}
</style>
