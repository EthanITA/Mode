<script lang="ts" setup>
import type { CommentSpot } from "~/composables/useChrome";

const { spot } = defineProps<{ spot: CommentSpot }>();

const chrome = useChrome();
const inlineAsk = useState<boolean>("sc:inline-ask", () => false);

const draft = ref("");
const pen = useTemplateRef<HTMLElement>("pen");
let cameFrom: HTMLElement | undefined;

function focusPen(): void {
  pen.value?.querySelector("textarea")?.focus();
}

onMounted(async () => {
  cameFrom = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  await nextTick();
  // A key still held owns the keyboard, so focusing now would type the shortcut itself into the draft.
  if (!chrome.comment.held.value) focusPen();
});

watch(chrome.comment.held, (down) => {
  if (!down) focusPen();
});

onBeforeUnmount(() => cameFrom?.focus());

function onKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  if ((event.metaKey || event.ctrlKey) && spot.ask) chrome.comment.ask(draft.value);
  else chrome.comment.save(draft.value);
}

// The pick is left standing: the artifact page reads it to place the edit panel, then closes this one.
function onEdit(): void {
  inlineAsk.value = true;
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
      <button v-if="spot.canEdit" v-press class="cancel focusable" type="button" @click="onEdit">Edit</button>
      <button v-press class="cancel focusable" type="button" data-tip="Cancel · {esc}" @click="chrome.comment.close()">
        Cancel
      </button>
      <button
        v-if="spot.ask"
        v-press
        class="ask focusable"
        type="button"
        data-region="comment-ask"
        data-tip="Ask on the side, the session isn't told · {cmd enter}"
        :disabled="!draft.trim()"
        @click="chrome.comment.ask(draft)"
      >
        Ask
      </button>
      <button
        v-press
        class="save focusable"
        type="button"
        data-tip="Add to the tray · {enter}"
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
  @apply fixed inset-0 z-35 bg-secondary/18;
}

/* Padding is the surface's own, so nothing here can race the package's per-variant default. */
.card {
  @apply fixed z-36 flex w-105 max-w-[calc(100vw_-_32px)] flex-col gap-2.5;
}

.who {
  @apply m-0 flex min-w-0 items-center gap-2;
}

.kind {
  @apply flex-none rounded-full bg-primary-soft px-2 py-1 text-primary-deep;
}

.label {
  @apply min-w-0 flex-1 truncate text-[12.5px] font-bold text-fg;
}

.tell {
  @apply flex flex-col gap-1.25 rounded-lg bg-sunken px-2.5 py-2;
}

.tell-head {
  @apply text-muted;
}

.tell-body {
  @apply font-mono text-[11.5px] leading-normal text-pretty text-fg;
}

/* A long selection or block shows its opening only, so the card keeps its size. */
.tell-quote {
  @apply line-clamp-3 border-l-2 border-l-border-strong pl-2 text-[11.5px] leading-normal text-pretty text-muted;
}

.foot {
  @apply m-0 flex items-center justify-end gap-2.5;
}

.cancel,
.ask,
.save {
  @apply h-7 flex-none cursor-pointer rounded-full font-sans text-[11.5px] font-semibold;
}

.cancel {
  @apply border border-border bg-raised px-2.5 py-0 text-muted;
}

.cancel:hover {
  @apply border-fg text-fg;
}

.save {
  @apply border-0 bg-fg px-3 py-0 text-canvas;
}

.ask {
  @apply inline-flex items-center gap-2 border border-border-strong bg-raised px-3 py-0 text-fg;
}

.ask:hover:not(:disabled) {
  @apply border-fg;
}

.ask:disabled,
.save:disabled {
  @apply cursor-not-allowed opacity-45;
}
</style>
