<script lang="ts" setup>
import type { ReviewThread, ThreadReply } from "~~/shared/types/artifact";
import type { Pin } from "~/utils/anchors";

const { adrift = false, pin, slug } = defineProps<{ adrift?: boolean; pin: Pin; slug: string }>();

const emit = defineEmits<{ close: [] }>();

const chrome = useChrome();
const tray = useTray();
const at = ref(0);
const draft = ref("");

const thread = computed<ReviewThread | undefined>(() => pin.threads[Math.min(at.value, pin.threads.length - 1)]);

const messages = computed<ThreadReply[]>(() => {
  const one = thread.value;
  if (!one) return [];
  return [{ at: one.at, body: one.body, by: one.by, id: one.id }, ...one.replies];
});

// Two intents on one thread need two ids, or hitting Resolve would swallow a reply already waiting.
const replyId = computed(() => `reply:${thread.value?.id ?? ""}`);
const resolveId = computed(() => `resolve:${thread.value?.id ?? ""}`);

const replyQueued = computed(() => tray.items.value.some((item) => item.id === replyId.value));
const resolveQueued = computed(() => tray.items.value.some((item) => item.id === resolveId.value));

const where = computed(() => {
  if (adrift) return `${plural(pin.threads.length, "note")} · the text they quote is gone from this version`;
  return pin.label || "somewhere on the page";
});

function initialOf(by: string): string {
  return authorOf(by).charAt(0).toUpperCase();
}

function step(by: number): void {
  at.value = (at.value + by + pin.threads.length) % pin.threads.length;
  draft.value = "";
}

function reply(): void {
  const text = draft.value.trim();
  const one = thread.value;
  if (!text || !one) return;
  tray.add({ id: replyId.value, kind: "reply", quote: one.anchor?.quote, source: slug, text });
  draft.value = "";
  chrome.toast("In the tray · Send notes hands it to Claude");
}

// Nothing here writes the artifact, so resolving asks Claude in a sentence rather than flipping state.
function resolve(): void {
  const one = thread.value;
  if (!one) return;
  tray.add({
    id: resolveId.value,
    kind: "reply",
    quote: one.anchor?.quote,
    source: slug,
    text: `Resolve note ${one.n}.`,
  });
  chrome.toast("Resolve requested · Send notes hands it to Claude");
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  reply();
}
</script>

<template>
  <div v-if="thread" class="thread" data-region="read-thread">
    <p class="where mono-meta">{{ where }}</p>

    <header>
      <span class="title">Comment</span>
      <span class="meta mono-meta">note {{ thread.n }} · {{ relativeAge(thread.at) }} · {{ thread.status }}</span>
      <span class="spacer" />
      <span v-if="pin.threads.length > 1" class="pager">
        <button
          v-press
          class="plain-button mono-meta focusable"
          type="button"
          aria-label="Previous note"
          @click="step(-1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18 9 12l6-6" /></svg>
        </button>
        <span class="mono-meta">{{ at + 1 }}/{{ pin.threads.length }}</span>
        <button v-press class="plain-button mono-meta focusable" type="button" aria-label="Next note" @click="step(1)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </span>
      <button
        v-if="thread.status === 'open'"
        v-press
        class="resolve focusable"
        type="button"
        :data-queued="resolveQueued ? '' : undefined"
        @click="resolve"
      >
        {{ resolveQueued ? "Resolve requested" : "Ask Claude to resolve" }}
      </button>
    </header>

    <blockquote v-if="thread.anchor?.quote" class="quote">{{ thread.anchor.quote }}</blockquote>
    <p v-if="pin.weak" class="warn mono-meta">this quote appears more than once — the pill sits on the first</p>

    <div v-for="message in messages" :key="message.id" class="message">
      <span class="who" :data-you="authorOf(message.by) === 'you' ? '' : undefined">{{ initialOf(message.by) }}</span>
      <div class="said">
        <Prose class="body" :value="message.body" />
        <span class="meta mono-meta">{{ authorOf(message.by) }} · {{ relativeAge(message.at) }}</span>
      </div>
    </div>

    <p v-if="replyQueued || resolveQueued" class="queued mono-meta">in the tray · waits for Send notes</p>

    <UiTextarea v-model="draft" auto-fit placeholder="Reply to Claude…" :rows="2" @keydown="onKey" />

    <footer>
      <button v-press class="ghost focusable" type="button" data-tip="Close · {esc}" @click="emit('close')">
        Close
      </button>
      <button
        v-press
        class="solid focusable"
        type="button"
        data-tip="Add to the tray · {enter}"
        :disabled="!draft.trim()"
        @click="reply"
      >
        Reply
      </button>
    </footer>
  </div>
</template>

<style scoped>
.thread {
  @apply flex flex-col gap-2.5 px-3.5 py-3;
}

.where {
  @apply m-0 text-subtle;
}

header {
  @apply flex flex-wrap items-center gap-x-2 gap-y-1.5;
}

.title {
  @apply typo-body-strong font-bold;
}

.meta {
  @apply text-subtle;
}

.spacer {
  @apply flex-1;
}

.pager {
  @apply inline-flex items-center gap-1.5 text-muted;
}

.pager svg {
  @apply size-3 fill-none stroke-current stroke-2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.resolve {
  @apply cursor-pointer rounded-selector border border-border bg-raised px-2.5 py-1 typo-caption-strong whitespace-nowrap text-success transition-colors duration-(--duration-fast) ease-out;
}

.resolve:hover {
  @apply border-success;
}

/* Queued is not resolved: it reads as pending until the turn that writes it lands. */
.resolve[data-queued] {
  @apply border-dashed text-primary;
}

.quote {
  @apply quote;
}

.warn {
  @apply m-0 text-warning;
}

.message {
  @apply flex gap-2.5;
}

.who {
  @apply mt-0.5 grid size-4.5 flex-none place-items-center rounded-selector bg-primary-soft typo-mono-micro font-semibold text-primary;
}

.who[data-you] {
  @apply bg-warning-soft text-warning;
}

.said {
  @apply min-w-0;
}

.body {
  @apply m-0;
}

.queued {
  @apply m-0 text-primary;
}

footer {
  @apply flex items-center justify-end gap-2.5;
}

.ghost,
.solid {
  @apply cursor-pointer rounded-field px-3 py-1.5 typo-caption-strong;
}

.ghost {
  @apply border border-border bg-transparent text-muted;
}

.solid {
  @apply border-0 bg-fg text-canvas;
}

.solid:disabled {
  @apply cursor-not-allowed opacity-50;
}

@media (prefers-reduced-motion: reduce) {
  .resolve {
    @apply transition-none;
  }
}
</style>
