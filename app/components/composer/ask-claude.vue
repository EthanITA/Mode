<script lang="ts" setup>
import { Trash2, Undo2, X } from "@lucide/vue";
import type { AskClaudeState, AskClaudeTurn } from "~/utils/ask-claude";

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ send: [turn: AskClaudeTurn] }>();

const sc = useSidecar();
const chrome = useChrome();
const { sessionState } = useScreen();
const askClaude = $askClaude();

const draft = ref("");
const isHovered = ref(false);
// Hover only slides the field out, so a pointer passing over never pulls focus from what is being typed elsewhere.
const isShown = computed(() => open.value || isHovered.value);
const box = useTemplateRef<HTMLElement>("box");
const list = useTemplateRef<HTMLElement>("list");

const STATE_LINES: Record<AskClaudeState, string> = {
  idle: "",
  asking: "asking · not in the conversation",
  answered: "answered · not in the conversation",
  failed: "failed · no answer",
};

const view = computed(() => askClaude.view(sc.sessionKey.value));
const question = computed(() => askClaudeQuestion(draft.value));
const canAsk = computed(() => !!question.value && view.value.state !== "asking");
const thinking = computed(() =>
  sessionState.value === "busy"
    ? "Reading the whole conversation, the running turn included"
    : "Reading the whole conversation",
);
const footLine = computed(() => {
  if (view.value.state === "asking") return "answers arrive whole";
  return view.value.state === "answered" ? "nothing written to the transcript" : "";
});
const isLast = (turn: AskClaudeTurn): boolean => view.value.turns.at(-1)?.id === turn.id;

function focus(): void {
  open.value = true;
  void nextTick(() => box.value?.querySelector("textarea")?.focus());
}

// The draft is kept through the fold, so clicking away to read loses nothing typed.
function onFocusOut(event: FocusEvent): void {
  if (!(event.relatedTarget instanceof Node && box.value?.contains(event.relatedTarget))) open.value = false;
}

function submit(text = question.value): void {
  const key = sc.sessionKey.value;
  if (!key || !text || view.value.state === "asking") return;
  draft.value = "";
  void askClaude.ask(key, text);
}

// One key walks back out: a running ask first, then the island itself.
function escape(): void {
  const key = sc.sessionKey.value;
  if (!key) return;
  if (view.value.state === "asking") {
    draft.value = askClaude.cancel(key) ?? draft.value;
    focus();
  } else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

function clear(): void {
  const key = sc.sessionKey.value;
  if (!key) return;
  const gone = askClaude.clear(key);
  focus();
  if (!gone.length) return;
  chrome.notify({
    action: "Undo",
    icon: Undo2,
    open: () => askClaude.restore(key, gone),
    text: `Cleared ${plural(gone.length, "side question")}`,
  });
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    escape();
    return;
  }
  if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  submit();
}

watch(open, (isOpen) => isOpen && focus(), { immediate: true });
// The newest exchange is the one being read, so a new question or answer brings the thread to its foot.
watch(
  () => [open.value, view.value.turns.length, view.value.state],
  () => void nextTick(() => list.value?.scrollTo({ top: list.value.scrollHeight })),
);
watch(
  () => sc.sessionKey.value,
  () => (draft.value = ""),
);

defineExpose({ focus });
</script>

<template>
  <UiSurface
    class="island"
    data-region="ask-claude"
    pad="none"
    shape="island"
    variant="glass-liquid"
    :data-open="isShown"
    :responsive="{ axis: 'height', anchorY: 'end' }"
    @pointerenter="isHovered = true"
    @pointerleave="isHovered = false"
  >
    <div
      ref="box"
      class="body"
      :data-tip="open && !view.turns.length ? 'Close · {esc}' : undefined"
      @focusin="open = true"
      @focusout="onFocusOut"
      @keydown="onKey"
    >
      <section v-if="open && view.turns.length" class="thread" data-region="ask-thread">
        <header class="head">
          <span class="title">Ask Claude</span>
          <span class="state mono-meta" data-region="ask-state" :data-state="view.state">{{
            STATE_LINES[view.state]
          }}</span>
          <UiIconButton
            :icon="Trash2"
            aria-label="Clear the side questions"
            data-region="ask-clear"
            data-tip="Clear the side questions"
            size="xs"
            @click="clear"
          />
          <button
            v-press
            class="dismiss focusable"
            type="button"
            :aria-label="view.state === 'asking' ? 'Cancel' : 'Close'"
            :data-tip="view.state === 'asking' ? 'Cancel · {esc}' : 'Close · {esc}'"
            @click="escape"
          >
            <UiIcon :icon="X" size="xs" />
          </button>
        </header>

        <div ref="list" class="turns">
          <div v-for="turn in view.turns" :key="turn.id" class="turn">
            <article class="asked">
              <span class="mono-meta">you</span>
              <p class="bubble">{{ turn.question }}</p>
            </article>

            <div class="reply">
              <span class="perch">
                <ClaudeMascot :size="44" :state="askClaudeState(turn) === 'asking' ? 'thinking' : 'idle'" />
              </span>
              <div class="words">
                <p v-if="askClaudeState(turn) === 'asking'" class="thinking shimmer">{{ thinking }}…</p>
                <Prose v-else-if="turn.answer" :value="turn.answer" />
                <p v-else class="failure" role="alert">{{ turn.failure }}</p>
              </div>
            </div>

            <footer class="foot">
              <span class="mono-meta">{{ isLast(turn) ? footLine : "" }}</span>
              <button
                v-if="askClaudeState(turn) === 'answered'"
                v-press
                class="secondary focusable"
                type="button"
                :disabled="sessionState === 'gone' || turn.isSent"
                :title="
                  sessionState === 'gone'
                    ? 'The session is gone, so nothing can be sent to it'
                    : 'Send the question and answer as your next message'
                "
                @click="emit('send', turn)"
              >
                {{ turn.isSent ? "Sent" : "Send to session" }}
              </button>
              <button
                v-else-if="askClaudeState(turn) === 'failed' && isLast(turn)"
                v-press
                class="secondary focusable"
                type="button"
                @click="submit(turn.question)"
              >
                Ask again
              </button>
            </footer>
          </div>
        </div>
      </section>

      <div class="row">
        <button class="wake plain-button focusable" type="button" aria-label="Ask Claude on the side" @click="focus">
          <ComposerSessionPerch :tip="open ? undefined : 'Ask Claude on the side · {alt enter}'" />
        </button>
        <UiTextarea
          v-show="isShown"
          v-model="draft"
          auto-fit
          class="field focusable"
          variant="bare"
          :rows="1"
          :placeholder="view.turns.length ? 'Ask a follow-up…' : 'Ask Claude about this conversation…'"
          aria-label="Ask Claude"
        />
        <button
          v-show="isShown"
          v-press
          class="ask focusable"
          type="button"
          data-tip="Ask · {enter}"
          :disabled="!canAsk"
          @click="submit()"
        >
          Ask
        </button>
      </div>
    </div>
  </UiSurface>
</template>

<style scoped>
.island {
  @apply w-150 max-w-full transition-all duration-(--duration-base) ease-out;
}

/* At rest only the mascot shows, and the width it grows back into is what reveals the field. */
.island[data-open="false"] {
  @apply w-14 rounded-full;
}

.island[data-open="false"] .body,
.island[data-open="false"] .row {
  @apply min-h-0 p-0;
}

.island[data-open="false"] .row {
  @apply h-14 items-center justify-center;
}

.wake {
  @apply flex flex-none cursor-pointer items-center justify-center rounded-full;
}

/* Bounded like the rest of the dock, so a long answer scrolls instead of pushing the header off the top. */
.body {
  @apply flex max-h-[calc(100vh_-_var(--stage-top)_-_var(--gutter))] min-h-0 flex-col gap-1 py-1.5 pr-1.5 pl-2;
}

.thread {
  @apply mb-0.5 flex min-h-0 flex-col gap-2.5 border-b border-b-border pt-0 pr-1 pb-2 pl-0.5;
}

/* Only the exchanges scroll, so the header with Clear and Close stays put above them. */
.turns {
  @apply flex min-h-0 scrollbar-thin flex-col gap-4.5 overflow-y-auto;
}

.turn {
  @apply flex flex-col gap-2.5;
}

.head {
  @apply flex items-center gap-0.5 pt-1.25 pr-0.5 pb-0 pl-1;
}

.title {
  @apply mr-1.5 flex-none typo-caption-strong text-fg;
}

.state {
  @apply min-w-0 flex-1 truncate text-subtle;
}

.state[data-state="failed"] {
  @apply text-error;
}

.dismiss {
  @apply inline-flex h-6.5 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent px-2 py-0 text-muted;
}

.dismiss:hover {
  @apply bg-sunken text-fg;
}

.asked {
  @apply flex max-w-11/12 flex-col items-end gap-1 self-end;
}

.asked .mono-meta {
  @apply text-subtle;
}

.bubble {
  @apply m-0 rounded-box bg-primary-soft px-3 py-2 typo-body whitespace-pre-wrap text-fg;
}

.reply {
  @apply flex items-start gap-2;
}

.perch {
  @apply flex h-11 w-12.5 flex-none items-center justify-center;
}

.words {
  @apply min-w-0 flex-1 pt-1 typo-body;
}

.thinking {
  @apply m-0 pt-0.5 typo-body text-muted italic;
}

.failure {
  @apply m-0 rounded-field border border-error bg-error-soft px-3 py-2 text-error;
}

.foot {
  @apply flex min-h-7 items-center justify-between gap-2.5 pl-14.5;
}

.foot .mono-meta {
  @apply text-subtle;
}

.secondary {
  @apply h-6.5 flex-none cursor-pointer rounded-full border border-border-strong bg-raised px-2.75 py-0 font-sans typo-caption-strong text-fg;
}

.secondary:disabled {
  @apply cursor-default opacity-45;
}

.row {
  @apply flex min-h-9 flex-none items-end gap-2 pt-0.5 pr-1 pb-0.75 pl-0.5;
}

/* auto-fit grows the box and hides its overflow; the cap is this call site's, so scrolling comes back with it. */
.row :deep(.textarea[data-auto-fit="true"]) {
  @apply max-h-28 scrollbar-thin overflow-y-auto;
}

.field {
  @apply min-w-0 flex-1 self-center;
}

.ask {
  @apply inline-flex h-7.5 flex-none cursor-pointer items-center gap-2 rounded-full border-0 bg-fg px-3 py-0 font-sans typo-caption-strong whitespace-nowrap text-canvas;
}

.ask:disabled {
  @apply cursor-not-allowed opacity-45;
}
</style>
