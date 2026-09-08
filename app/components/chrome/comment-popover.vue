<script lang="ts" setup>
import type { CommentSpot } from "~/composables/useChrome";

const { spot } = defineProps<{ spot: CommentSpot }>();

const chrome = useChrome();

const draft = ref("");
const pen = useTemplateRef<HTMLElement>("pen");
let cameFrom: HTMLElement | undefined;

onMounted(async () => {
  cameFrom = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  await nextTick();
  pen.value?.querySelector("textarea")?.focus();
});

onBeforeUnmount(() => cameFrom?.focus());

function onKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  chrome.comment.save(draft.value);
}
</script>

<template>
  <div class="scrim" @click="chrome.comment.close()" />

  <UiSurface
    v-island-pop="'top left'"
    class="card"
    data-region="comment-popover"
    pad="xs"
    variant="raised"
    role="dialog"
    :aria-label="`Comment on ${spot.label}`"
    :style="{ left: `${spot.x}px`, top: `${spot.y}px` }"
  >
    <p class="who">
      <span class="kind mono-meta">{{ spot.kind }}</span>
      <span class="label">{{ spot.label }}</span>
    </p>

    <div class="tell">
      <span class="tell-head mono-meta">Claude will be told</span>
      <span class="tell-body">{{ spot.tell }}</span>
      <span v-if="spot.excerpt" class="tell-quote">{{ spot.excerpt }}</span>
    </div>

    <div ref="pen">
      <UiTextarea v-model="draft" :rows="3" placeholder="What should change?" @keydown="onKey" />
    </div>

    <p class="foot">
      <span class="hint mono-meta">↵ to tray · esc cancel</span>
      <button v-press class="cancel focusable" type="button" @click="chrome.comment.close()">Cancel</button>
      <button
        v-press
        class="save focusable"
        type="button"
        :disabled="!draft.trim()"
        @click="chrome.comment.save(draft)"
      >
        Add to tray
      </button>
    </p>
  </UiSurface>
</template>

<style scoped>
.scrim {
  background: color-mix(in oklch, var(--secondary) 18%, transparent);
  inset: 0;
  position: fixed;
  z-index: 35;
}

/* Padding is the surface's own, so nothing here can race the package's per-variant default. */
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: calc(100vw - 32px);
  position: fixed;
  width: 420px;
  z-index: 36;
}

.who {
  align-items: center;
  display: flex;
  gap: 8px;
  margin: 0;
  min-width: 0;
}

.kind {
  background: var(--primary-soft);
  border-radius: 999px;
  color: var(--primary-deep);
  flex: none;
  padding: 4px 8px;
}

.label {
  color: var(--ink);
  flex: 1;
  font-size: 12.5px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tell {
  background: var(--sunken);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
}

.tell-head {
  color: var(--muted);
}

.tell-body {
  color: var(--ink);
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.5;
  text-wrap: pretty;
}

.tell-quote {
  border-left: 2px solid var(--border-strong);
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.5;
  padding-left: 8px;
  text-wrap: pretty;
}

.foot {
  align-items: center;
  display: flex;
  gap: 10px;
  margin: 0;
}

.hint {
  color: var(--subtle);
  flex: 1;
  text-transform: none;
}

.cancel,
.save {
  border-radius: 999px;
  cursor: pointer;
  flex: none;
  font-family: var(--sans);
  font-size: 11.5px;
  font-weight: 600;
  height: 28px;
}

.cancel {
  background: var(--raised);
  border: 1px solid var(--border);
  color: var(--muted);
  padding: 0 10px;
}

.cancel:hover {
  border-color: var(--ink);
  color: var(--ink);
}

.save {
  background: var(--ink);
  border: 0;
  color: var(--canvas);
  padding: 0 12px;
}

.save:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
