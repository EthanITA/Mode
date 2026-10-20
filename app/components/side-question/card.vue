<script lang="ts" setup>
import { Check, RotateCcw, Send, Square } from "@lucide/vue";
import { revealLines } from "~/components/prose-line.vue";
import type { SideThread } from "~/utils/ask-claude";
import type { LineSpan } from "~/utils/monaco/notes";

const { reveal, source, thread } = defineProps<{
  reveal?: (lines: LineSpan) => void;
  source: "code" | "prose";
  thread: SideThread;
}>();

const sides = $sideQuestion();
const chrome = useChrome();
const { sessionState } = useScreen();
const scroller = useTemplateRef<HTMLElement>("scroller");
const field = useTemplateRef<HTMLElement>("field");
const undoButton = useTemplateRef<HTMLButtonElement>("undoButton");

provide(revealLines, (lines) => reveal?.(lines));

const state = computed(() => SideQuestion.stateOf(thread));
const isBusy = computed(() => state.value === "asking" || state.value === "followup");
const isSending = ref(false);
const answered = computed(() => thread.turns.filter((turn) => !!turn.answer).length);
const canSend = computed(
  () => !isBusy.value && !isSending.value && answered.value > 0 && sessionState.value !== "gone",
);
const file = computed(() => (source === "code" ? basename(thread.anchor.place) : undefined));
const draft = computed({
  get: () => thread.draft,
  set: (text: string) => {
    thread.draft = text;
  },
});
const went = computed(() => {
  const count = answered.value;
  const asked =
    count === 1
      ? "Your question and its answer"
      : count === 2
        ? "Your two questions and both answers"
        : `Your ${count} questions and their answers`;
  return `${asked} went with it${thread.draft.trim() ? ", and so did what you typed" : ""}.`;
});

function focusField(): void {
  field.value?.querySelector("textarea")?.focus({ preventScroll: true });
}

function ask(): void {
  const question = draft.value.trim();
  if (!question || isBusy.value) return;
  sides.follow(thread.id, question);
}

async function resolve(): Promise<void> {
  sides.resolve(thread.id);
  await nextTick();
  undoButton.value?.focus({ preventScroll: true });
}

async function undo(): Promise<void> {
  sides.undo(thread.id);
  await nextTick();
  focusField();
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  isSending.value = true;
  try {
    const reply = await sides.send(thread.id);
    if (reply === "unreachable") chrome.toast("The sidecar could not reach its server.", "destructive");
    else if (reply && !reply.delivered)
      chrome.toast("The conversation did not take it, try again in a moment.", "warning");
  } finally {
    isSending.value = false;
  }
}

// Stopped here, every key stays the card's: Monaco's ⌘K, the tray's ⌘↵ and the app's Esc all sit above it.
function onKey(event: KeyboardEvent): void {
  event.stopPropagation();
  const mod = event.metaKey || event.ctrlKey;
  if (event.key === "Escape") {
    event.preventDefault();
    if (isBusy.value) sides.stop(thread.id);
    else if (event.target instanceof HTMLElement) event.target.blur();
  } else if (event.key === "Enter" && mod) {
    event.preventDefault();
    void send();
  } else if (event.key === "Backspace" && mod && !draft.value && !isBusy.value) {
    event.preventDefault();
    void resolve();
  }
}

function onFieldKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  ask();
}

function onFoldedKey(event: KeyboardEvent): void {
  event.stopPropagation();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    void undo();
  }
}

watch(
  () => [thread.turns.length, thread.turns.at(-1)?.answer, thread.turns.at(-1)?.failure],
  async () => {
    await nextTick();
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  },
  { immediate: true },
);

// After the popover hands focus back to whatever opened it, or Esc never reaches Stop.
onMounted(() => {
  if (sides.claimFocus(thread.id)) setTimeout(focusField, 0);
});
</script>

<template>
  <div
    v-if="state === 'resolved'"
    class="folded"
    data-region="side-question"
    data-state="resolved"
    role="status"
    @keydown="onFoldedKey"
  >
    <UiIcon class="tick" :icon="Check" size="xs" />
    <span class="folded-title">Resolved</span>
    <span class="folded-question">{{ thread.turns[0]?.question ?? thread.draft }}</span>
    <button ref="undoButton" v-press class="undo focusable" type="button" data-tip="Undo · {cmd Z}" @click="undo">
      Undo
    </button>
  </div>

  <UiSurface
    v-else
    class="card"
    data-region="side-question"
    pad="none"
    variant="raised"
    :data-source="source"
    :data-state="state"
    @keydown="onKey"
  >
    <header class="head">
      <span class="target mono-meta">{{ thread.anchor.label }}</span>
      <span
        v-if="state !== 'sent'"
        class="only mono-meta"
        data-tip="A side question. The session isn't told until you send it."
      >
        only you
      </span>
    </header>

    <blockquote v-if="source === 'prose' && thread.anchor.quote" class="quote">{{ thread.anchor.quote }}</blockquote>

    <div v-if="state === 'sent'" class="sent" role="status">
      <span class="sent-title"><span class="dot" />Sent to the conversation</span>
      <span class="sent-line">Claude acts on it next. {{ went }}</span>
    </div>

    <template v-else>
      <div v-if="thread.turns.length" ref="scroller" class="thread" data-region="side-question-thread" @wheel.stop>
        <template v-for="turn in thread.turns" :key="turn.id">
          <div class="asked">
            <span class="mono-meta">You asked</span>
            <span class="asked-text">{{ turn.question }}</span>
          </div>
          <Prose v-if="turn.answer" class="answer" :line-refs-of="file" :value="turn.answer" />
          <p v-else-if="turn.failure" class="failure" role="alert">{{ turn.failure }}</p>
          <template v-else>
            <p class="thinking shimmer">Reading the file<span class="dots" /></p>
            <span v-if="thread.turns.length === 1" class="bones" aria-hidden="true"><span /><span /><span /></span>
          </template>
        </template>
      </div>

      <div ref="field" class="field" data-tip="Ask · {enter}" :data-busy="isBusy">
        <UiTextarea
          v-model="draft"
          auto-fit
          class="field-box"
          variant="bare"
          :rows="1"
          :placeholder="isBusy ? 'Claude is answering' : thread.turns.length ? 'Ask a follow-up' : 'Ask about this'"
          aria-label="Ask a follow-up"
          @keydown="onFieldKey"
        />
      </div>

      <footer class="actions">
        <button
          v-if="isBusy"
          v-press
          class="act focusable"
          type="button"
          data-tip="Stop · {esc}"
          @click="sides.stop(thread.id)"
        >
          <UiIcon :icon="Square" size="xs" />Stop
        </button>
        <template v-else>
          <button
            v-if="state === 'failed'"
            v-press
            class="act focusable"
            type="button"
            data-tone="primary"
            @click="sides.retry(thread.id)"
          >
            <UiIcon :icon="RotateCcw" size="xs" />Ask again
          </button>
          <button
            v-press
            class="act focusable"
            type="button"
            data-tip="Done with it · {cmd backspace}"
            @click="resolve"
          >
            <UiIcon :icon="Check" size="xs" />Resolve
          </button>
          <button
            v-if="answered"
            v-press
            class="act focusable"
            type="button"
            data-tone="primary"
            :disabled="!canSend"
            :data-tip="
              sessionState === 'gone'
                ? 'The session is gone, so nothing can be sent to it'
                : 'Send the thread to the session so Claude acts on it · {cmd enter}'
            "
            @click="send"
          >
            <UiIcon :icon="Send" size="xs" />Send to conversation
          </button>
        </template>
      </footer>
    </template>
  </UiSurface>
</template>

<style scoped>
.card {
  @apply flex w-full flex-col gap-2.5 px-3.5 py-3 font-sans text-fg select-text;
}

.head {
  @apply flex min-w-0 items-center gap-2;
}

.target {
  @apply min-w-0 flex-1 truncate text-subtle;
}

.only {
  @apply flex-none text-subtle;
}

.quote {
  @apply quote line-clamp-3;
}

.sent {
  @apply flex flex-col gap-0.75 rounded-field bg-success-soft px-2.5 py-2;
}

.sent-title {
  @apply flex items-center gap-1.75 typo-body-strong;
}

.dot {
  @apply size-1.75 flex-none rounded-full bg-success;
}

.sent-line {
  @apply typo-caption leading-normal text-pretty text-muted;
}

.thread {
  @apply flex h-43 scrollbar-thin flex-col gap-2 overflow-y-auto overscroll-contain;
}

.asked {
  @apply flex flex-none flex-col gap-0.5;
}

.asked .mono-meta {
  @apply text-muted;
}

.asked-text {
  @apply typo-body whitespace-pre-wrap text-muted;
}

.answer {
  @apply flex-none typo-body text-pretty;
}

.failure {
  @apply m-0 flex-none typo-body text-error;
}

.thinking {
  @apply m-0 flex-none typo-body;
}

.dots::after {
  @apply content-[''];
  animation: side-dots 1.4s steps(1, end) infinite;
}

@keyframes side-dots {
  0% {
    content: "";
  }
  25% {
    content: ".";
  }
  50% {
    content: "..";
  }
  75% {
    content: "...";
  }
}

.bones {
  @apply flex flex-none flex-col gap-2.25 pt-0.5;
}

.bones span {
  @apply h-2 rounded-full bg-fg/7;
}

.bones span:nth-child(2) {
  @apply w-11/12;
}

.bones span:nth-child(3) {
  @apply w-7/12;
}

.field {
  @apply flex min-h-8 items-center gap-2 rounded-2xl border border-border bg-sunken px-3 py-1;
}

.field[data-busy="true"] {
  @apply opacity-50;
}

.field-box {
  @apply min-w-0 flex-1 typo-body;
}

.field :deep(.textarea[data-auto-fit="true"]) {
  @apply max-h-24 overflow-y-auto;
}

.actions {
  @apply -mt-1 mr-0 -mb-1.5 -ml-1.5 flex flex-wrap gap-1;
}

.act {
  @apply inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent p-1.5 typo-caption-strong text-muted;
}

.act[data-tone="primary"] {
  @apply text-primary-deep;
}

.act:disabled {
  @apply cursor-default opacity-45;
}

@media (hover: hover) and (pointer: fine) {
  .act:hover:not(:disabled) {
    @apply bg-sunken text-fg;
  }

  .act[data-tone="primary"]:hover:not(:disabled) {
    @apply bg-primary-soft text-primary-deep;
  }
}

.folded {
  @apply flex h-11 w-full items-center gap-2 rounded-box border border-border bg-raised py-0 pr-2 pl-3 font-sans text-fg shadow-sm;
}

.tick {
  @apply flex-none text-success;
}

.folded-title {
  @apply flex-none typo-body-strong font-bold;
}

.folded-question {
  @apply min-w-0 flex-1 truncate typo-caption text-muted;
}

.undo {
  @apply flex-none cursor-pointer rounded-lg border-0 bg-transparent p-1.5 typo-caption-strong text-primary-deep;
}

@media (hover: hover) and (pointer: fine) {
  .undo:hover {
    @apply bg-sunken;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dots::after {
    @apply animate-none content-['…'];
  }
}
</style>
