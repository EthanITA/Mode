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
const undoButton = useTemplateRef<{ $el: HTMLElement }>("undoButton");

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
  undoButton.value?.$el.focus({ preventScroll: true });
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
    <UiButton ref="undoButton" data-tip="Undo · {cmd Z}" size="xs" variant="ghost" @click="undo">Undo</UiButton>
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

    <UiSurface v-if="state === 'sent'" class="sent" pad="xs" role="status" tone="success" variant="banner">
      <span class="sent-title">Sent to the conversation</span>
      <span class="sent-line">Claude acts on it next. {{ went }}</span>
    </UiSurface>

    <template v-else>
      <div v-if="thread.turns.length" ref="scroller" class="thread" data-region="side-question-thread" @wheel.stop>
        <template v-for="turn in thread.turns" :key="turn.id">
          <div class="asked">
            <span class="mono-meta">You asked</span>
            <span class="asked-text">{{ turn.question }}</span>
          </div>
          <Prose v-if="turn.answer" class="answer" :line-refs-of="file" :value="turn.answer" />
          <UiStateMessage v-else-if="turn.failure" class="failure" kind="error">{{ turn.failure }}</UiStateMessage>
          <template v-else>
            <p class="thinking shimmer">Reading the file…</p>
            <span v-if="thread.turns.length === 1" class="bones" aria-hidden="true"><span /><span /><span /></span>
          </template>
        </template>
      </div>

      <div ref="field" class="field" data-tip="Ask · {enter}" :data-busy="isBusy">
        <UiTextarea
          v-model="draft"
          auto-fit
          :max-rows="4"
          :rows="1"
          :placeholder="isBusy ? 'Claude is answering' : thread.turns.length ? 'Ask a follow-up' : 'Ask about this'"
          aria-label="Ask a follow-up"
          @keydown="onFieldKey"
        />
      </div>

      <footer class="actions">
        <UiButton
          v-if="isBusy"
          data-tip="Stop · {esc}"
          :icon="Square"
          size="xs"
          variant="ghost"
          @click="sides.stop(thread.id)"
        >
          Stop
        </UiButton>
        <template v-else>
          <UiButton
            v-if="state === 'failed'"
            :icon="RotateCcw"
            size="xs"
            variant="ghost"
            @click="sides.retry(thread.id)"
          >
            Ask again
          </UiButton>
          <UiButton data-tip="Done with it · {cmd backspace}" :icon="Check" size="xs" variant="ghost" @click="resolve">
            Resolve
          </UiButton>
          <UiButton
            v-if="answered"
            :aria-disabled="!canSend"
            :data-tip="
              sessionState === 'gone'
                ? 'The session is gone, so nothing can be sent to it'
                : 'Send the thread to the session so Claude acts on it · {cmd enter}'
            "
            :icon="Send"
            size="xs"
            variant="ghost"
            @click="send"
          >
            Send to conversation
          </UiButton>
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
  @apply flex-col items-start gap-0.75;
}

.sent-title {
  @apply typo-body-strong;
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
  @apply flex-none;
}

.thinking {
  @apply m-0 flex-none typo-body;
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

.field[data-busy="true"] {
  @apply opacity-50;
}

.actions {
  @apply -mt-1 mr-0 -mb-1.5 -ml-1.5 flex flex-wrap gap-1;
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
</style>
