<script lang="ts" setup>
import { Check, Maximize2, MessageSquare } from "@lucide/vue";
import type { CardView } from "~/composables/useCanvas";
import type { CardAction } from "~/types/canvas-action";

const { card, action } = defineProps<{ card: CardView; action?: CardAction }>();

const emit = defineEmits<{ act: []; open: [] }>();
</script>

<template>
  <article :data-cmt-label="card.title" :data-cmt-tell="card.tell" class="card" data-cmt="artifact">
    <header class="card-head">
      <span class="card-kind mono-meta">{{ card.kind }}</span>
      <span class="card-file">{{ card.file }}</span>
      <span v-if="card.fresh" class="card-fresh dot" title="new since you looked" />
      <span v-if="card.version" class="card-version">v{{ card.version }}</span>
      <button
        v-press
        class="card-open plain-button focusable"
        title="Open · read, diff, comment"
        type="button"
        @click="emit('open')"
      >
        <UiIcon :icon="Maximize2" size="xs" />
      </button>
    </header>

    <div class="card-body">
      <h3 class="card-title">{{ card.title }}</h3>
    </div>

    <footer class="card-foot">
      <span class="card-meta">{{ card.meta }}</span>
      <span v-if="card.comments" class="card-comments">
        <UiIcon :icon="MessageSquare" size="xs" />{{ card.comments }}
      </span>
      <span class="card-gap" />
      <span v-if="action?.done" class="card-done"> <UiIcon :icon="Check" size="xs" />{{ action.done }} </span>
      <button
        v-else-if="action"
        v-press
        :data-tone="action.tone"
        :disabled="action.pending"
        :title="action.title"
        class="card-act focusable"
        type="button"
        @click="emit('act')"
      >
        {{ action.label }}<span class="card-act-hint">{{ action.hint }}</span>
      </button>
    </footer>
  </article>
</template>

<style scoped>
.card {
  @apply flex h-full flex-col overflow-hidden;
}

.card-head,
.card-foot {
  @apply flex h-9.5 flex-none items-center gap-2 py-0 pr-2 pl-3.5;
}

.card-head {
  @apply border-b border-b-border;
}

.card-foot {
  @apply border-t border-t-border bg-canvas;
}

.card-kind {
  @apply flex-none tracking-[0.04em] text-muted;
}

.card-file {
  @apply min-w-0 flex-1 truncate font-mono text-[10.5px] font-medium text-subtle;
}

.card-fresh {
  @apply bg-primary;
  --dot-size: 6px;
}

.card-version {
  @apply inline-flex h-5 flex-none items-center rounded-full bg-sunken px-1.75 py-0 font-mono typo-micro text-muted;
}

.card-open {
  @apply grid size-6 flex-none place-items-center rounded-full text-muted;
}

.card-open:hover {
  @apply bg-sunken text-fg;
}

.card-body {
  @apply min-h-0 flex-1 overflow-hidden px-3.5 py-3;
}

.card-title {
  @apply font-sans text-[14px] leading-tight font-bold tracking-[-0.02em] text-balance;
}

.card-meta,
.card-done {
  @apply font-mono text-[10.5px] font-medium;
}

.card-meta {
  @apply min-w-0 truncate text-muted;
}

.card-comments {
  @apply inline-flex h-5 flex-none items-center gap-1 rounded-full bg-sunken px-1.75 py-0 font-sans text-[10.5px] font-semibold text-muted;
}

.card-gap {
  @apply flex-1;
}

.card-done {
  @apply inline-flex flex-none items-center gap-1.25 whitespace-nowrap text-success;
}

.card-act {
  @apply inline-flex h-6.5 flex-none cursor-pointer items-center gap-1.5 rounded-full border-0 px-2.75 py-0 font-sans text-[11.5px] font-semibold whitespace-nowrap;
}

.card-act[data-tone="primary"] {
  @apply bg-primary text-primary-content;
}

.card-act[data-tone="neutral"] {
  @apply bg-fg text-raised;
}

.card-act:disabled {
  @apply cursor-progress opacity-60;
}

.card-act-hint {
  @apply font-mono text-[9.5px] font-medium opacity-70;
}
</style>
