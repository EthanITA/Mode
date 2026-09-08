<script lang="ts" setup>
import { Check, Maximize2, MessageSquare } from "@lucide/vue";
import type { CardView } from "~/composables/useCanvas";
import type { CardAction } from "~/types/canvas-action";

const { card, action } = defineProps<{ card: CardView; action?: CardAction }>();

const emit = defineEmits<{ act: []; open: [] }>();
</script>

<template>
  <article
    :data-cmt-label="card.title"
    :data-cmt-tell="card.tell"
    class="card"
    data-cmt="artifact"
  >
    <header class="card-head">
      <span class="mono-meta card-kind">{{ card.kind }}</span>
      <span class="card-file">{{ card.file }}</span>
      <span v-if="card.fresh" class="dot card-fresh" title="new since you looked" />
      <span v-if="card.version" class="card-version">v{{ card.version }}</span>
      <button
        v-press
        class="plain-button focusable card-open"
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
      <span v-if="action?.done" class="card-done">
        <UiIcon :icon="Check" size="xs" />{{ action.done }}
      </span>
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
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.card-head,
.card-foot {
  align-items: center;
  display: flex;
  flex: none;
  gap: 8px;
  height: 38px;
  padding: 0 8px 0 14px;
}

.card-head {
  border-bottom: 1px solid var(--border);
}

.card-foot {
  background: var(--canvas);
  border-top: 1px solid var(--border);
}

.card-kind {
  color: var(--muted);
  flex: none;
  letter-spacing: 0.04em;
}

.card-file {
  color: var(--subtle);
  flex: 1;
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-fresh {
  background: var(--primary);
  --dot-size: 6px;
}

.card-version {
  align-items: center;
  background: var(--sunken);
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  flex: none;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 500;
  height: 20px;
  padding: 0 7px;
}

.card-open {
  border-radius: 999px;
  color: var(--muted);
  display: grid;
  flex: none;
  height: 24px;
  place-items: center;
  width: 24px;
}

.card-open:hover {
  background: var(--sunken);
  color: var(--ink);
}

.card-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px 14px;
}

.card-title {
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
  text-wrap: balance;
}

.card-meta,
.card-done {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
}

.card-meta {
  color: var(--muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-comments {
  align-items: center;
  background: var(--sunken);
  border-radius: 999px;
  color: var(--muted);
  display: inline-flex;
  flex: none;
  font-family: var(--sans);
  font-size: 10.5px;
  font-weight: 600;
  gap: 4px;
  height: 20px;
  padding: 0 7px;
}

.card-gap {
  flex: 1;
}

.card-done {
  align-items: center;
  color: var(--success);
  display: inline-flex;
  flex: none;
  gap: 5px;
  white-space: nowrap;
}

.card-act {
  align-items: center;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  flex: none;
  font-family: var(--sans);
  font-size: 11.5px;
  font-weight: 600;
  gap: 6px;
  height: 26px;
  padding: 0 11px;
  white-space: nowrap;
}

.card-act[data-tone="primary"] {
  background: var(--primary);
  color: var(--primary-content);
}

.card-act[data-tone="neutral"] {
  background: var(--ink);
  color: var(--raised);
}

.card-act:disabled {
  cursor: progress;
  opacity: 0.6;
}

.card-act-hint {
  font-family: var(--mono);
  font-size: 9.5px;
  font-weight: 500;
  opacity: 0.7;
}
</style>
