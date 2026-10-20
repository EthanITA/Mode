<script lang="ts" setup>
import { ChevronLeft, ChevronRight } from "@lucide/vue";
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
        <UiIconButton :icon="ChevronLeft" icon-size="xs" label="Previous note" size="xs" @click="step(-1)" />
        <span class="mono-meta">{{ at + 1 }}/{{ pin.threads.length }}</span>
        <UiIconButton :icon="ChevronRight" icon-size="xs" label="Next note" size="xs" @click="step(1)" />
      </span>
      <UiButton v-if="thread.status === 'open'" size="xs" variant="outline" @click="resolve">
        {{ resolveQueued ? "Resolve requested" : "Ask Claude to resolve" }}
      </UiButton>
    </header>

    <blockquote v-if="thread.anchor?.quote" class="quote">{{ thread.anchor.quote }}</blockquote>
    <p v-if="pin.weak" class="warn mono-meta">this quote appears more than once — the pill sits on the first</p>

    <div v-for="message in messages" :key="message.id" class="message">
      <UiAvatar
        class="who"
        :initials="initialOf(message.by)"
        size="xs"
        :variant="authorOf(message.by) === 'you' ? 'neutral' : 'soft'"
      />
      <div class="said">
        <Prose class="body" :value="message.body" />
        <span class="meta mono-meta">{{ authorOf(message.by) }} · {{ relativeAge(message.at) }}</span>
      </div>
    </div>

    <p v-if="replyQueued || resolveQueued" class="queued mono-meta">in the tray · waits for Send notes</p>

    <UiTextarea v-model="draft" auto-fit placeholder="Reply to Claude…" :rows="2" @keydown="onKey" />

    <footer>
      <UiButton data-tip="Close · {esc}" size="xs" variant="ghost" @click="emit('close')">Close</UiButton>
      <UiButton
        data-tip="Add to the tray · {enter}"
        :disabled="!draft.trim()"
        size="xs"
        variant="secondary"
        @click="reply"
      >
        Reply
      </UiButton>
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
  @apply inline-flex items-center gap-0.5 text-muted;
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
  @apply mt-0.5 flex-none;
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
  @apply flex items-center justify-end gap-1.5;
}
</style>
