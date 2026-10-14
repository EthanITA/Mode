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
  box-sizing: border-box;
  color: var(--ink);
  display: flex;
  flex-direction: column;
  font-family: var(--sans);
  gap: 10px;
  padding: 12px 14px;
  user-select: text;
  width: 100%;
}

.head {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.target {
  color: var(--subtle);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.only {
  color: var(--subtle);
  flex: none;
}

/* The shipped comment card's quote, so the two read as one family in the margin. */
.quote {
  background: var(--sunken);
  border-left: 2px solid var(--primary);
  border-radius: 0 6px 6px 0;
  color: var(--muted);
  display: -webkit-box;
  font-size: 12.5px;
  font-style: italic;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  line-height: 1.5;
  margin: 0;
  overflow: hidden;
  padding: 6px 10px;
}

.sent {
  background: var(--success-soft);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
}

.sent-title {
  align-items: center;
  display: flex;
  font-size: 12.5px;
  font-weight: 600;
  gap: 7px;
}

.dot {
  background: var(--success);
  border-radius: 999px;
  flex: none;
  height: 7px;
  width: 7px;
}

.sent-line {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  text-wrap: pretty;
}

.thread {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 172px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.asked {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
}

.asked .mono-meta {
  color: var(--muted);
}

.asked-text {
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.answer {
  flex: none;
  font-size: 13px;
  line-height: 1.55;
  text-wrap: pretty;
}

.failure {
  color: var(--error);
  flex: none;
  font-size: 12.5px;
  line-height: 1.5;
  margin: 0;
}

.thinking {
  flex: none;
  font-size: 12.5px;
  line-height: 1.5;
  margin: 0;
}

.dots::after {
  animation: side-dots 1.4s steps(1, end) infinite;
  content: "";
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
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 9px;
  padding-top: 2px;
}

.bones span {
  background: color-mix(in oklch, var(--ink) 7%, transparent);
  border-radius: 999px;
  height: 8px;
}

.bones span:nth-child(2) {
  width: 90%;
}

.bones span:nth-child(3) {
  width: 56%;
}

.field {
  align-items: center;
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-sizing: border-box;
  display: flex;
  gap: 8px;
  min-height: 32px;
  padding: 4px 12px;
}

.field[data-busy="true"] {
  opacity: 0.5;
}

.field-box {
  flex: 1;
  font-size: 12.5px;
  min-width: 0;
}

.field :deep(.textarea[data-auto-fit="true"]) {
  max-height: 96px;
  overflow-y: auto;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: -4px 0 -6px -6px;
}

.act {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  padding: 6px;
}

.act[data-tone="primary"] {
  color: var(--primary-deep);
}

.act:disabled {
  cursor: default;
  opacity: 0.45;
}

@media (hover: hover) and (pointer: fine) {
  .act:hover:not(:disabled) {
    background: var(--sunken);
    color: var(--ink);
  }

  .act[data-tone="primary"]:hover:not(:disabled) {
    background: var(--primary-soft);
    color: var(--primary-deep);
  }
}

.folded {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-box);
  box-shadow: var(--shadow-sm);
  box-sizing: border-box;
  color: var(--ink);
  display: flex;
  font-family: var(--sans);
  gap: 8px;
  height: 44px;
  padding: 0 8px 0 12px;
  width: 100%;
}

.tick {
  color: var(--success);
  flex: none;
}

.folded-title {
  flex: none;
  font-size: 12.5px;
  font-weight: 700;
}

.folded-question {
  color: var(--muted);
  flex: 1;
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo {
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: var(--primary-deep);
  cursor: pointer;
  flex: none;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px;
}

@media (hover: hover) and (pointer: fine) {
  .undo:hover {
    background: var(--sunken);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dots::after {
    animation: none;
    content: "…";
  }
}
</style>
