<script lang="ts" setup>
import { ChevronLeft, ChevronRight, Copy, X } from "@lucide/vue";
import { useClipboard } from "@vueuse/core";
import type { AskClaudeState, AskClaudeTurn } from "~/utils/ask-claude";

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ send: [turn: AskClaudeTurn] }>();

const sc = useSidecar();
const chrome = useChrome();
const { sessionState } = useScreen();
const askClaude = $askClaude();
const { copy } = useClipboard();

const draft = ref("");
const box = useTemplateRef<HTMLElement>("box");

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

function focus(): void {
  void nextTick(() => box.value?.querySelector("textarea")?.focus());
}

function submit(text = question.value): void {
  const key = sc.sessionKey.value;
  if (!key || !text || view.value.state === "asking") return;
  draft.value = "";
  void askClaude.ask(key, text);
}

// One key walks back out: a running ask first, then the card, then the island itself.
function escape(): void {
  const key = sc.sessionKey.value;
  if (!key) return;
  if (view.value.state === "asking") {
    draft.value = askClaude.cancel(key) ?? draft.value;
    focus();
  } else if (view.value.turn) askClaude.dismiss(key);
  else open.value = false;
}

function onKey(event: KeyboardEvent): void {
  const key = sc.sessionKey.value;
  if (event.key === "Escape") {
    event.preventDefault();
    escape();
    return;
  }
  // Arrows only step while the field is empty, so they still move the caret through a draft.
  if (key && !draft.value && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    askClaude.step(key, event.key === "ArrowLeft" ? -1 : 1);
    return;
  }
  if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  submit();
}

async function copyAnswer(): Promise<void> {
  if (!view.value.turn?.answer) return;
  await copy(view.value.turn.answer);
  chrome.toast("Answer copied", "success");
}

watch(open, (isOpen) => isOpen && focus(), { immediate: true });
watch(
  () => sc.sessionKey.value,
  () => (draft.value = ""),
);

defineExpose({ focus });
</script>

<template>
  <UiSurface
    v-if="open"
    class="island"
    data-region="ask-claude"
    pad="none"
    shape="island"
    variant="glass-liquid"
    :responsive="{ axis: 'height', anchorY: 'end' }"
  >
    <div ref="box" class="body" :data-tip="view.turn ? undefined : 'Close · {esc}'" @keydown="onKey">
      <section v-if="view.turn" class="thread" data-region="ask-thread">
        <header class="head">
          <span class="title">Ask Claude</span>
          <span class="state mono-meta" data-region="ask-state" :data-state="view.state">{{
            STATE_LINES[view.state]
          }}</span>
          <template v-if="view.state === 'answered'">
            <UiIconButton
              :icon="ChevronLeft"
              aria-label="Earlier answer"
              data-tip="Earlier answer · {left}"
              size="xs"
              :disabled="view.position <= 1"
              @click="askClaude.step(sc.sessionKey.value ?? '', -1)"
            />
            <span class="count mono-meta">{{ view.position }} / {{ view.count }}</span>
            <UiIconButton
              :icon="ChevronRight"
              aria-label="Later answer"
              data-tip="Later answer · {right}"
              size="xs"
              :disabled="view.position >= view.count"
              @click="askClaude.step(sc.sessionKey.value ?? '', 1)"
            />
            <UiIconButton :icon="Copy" label="Copy answer" size="xs" @click="copyAnswer" />
          </template>
          <button
            v-press
            class="dismiss focusable"
            type="button"
            :aria-label="view.state === 'asking' ? 'Cancel' : 'Dismiss'"
            :data-tip="view.state === 'asking' ? 'Cancel · {esc}' : 'Dismiss · {esc}'"
            @click="escape"
          >
            <UiIcon :icon="X" size="xs" />
          </button>
        </header>

        <article class="asked">
          <span class="mono-meta">you</span>
          <p class="bubble">{{ view.turn.question }}</p>
        </article>

        <div class="reply">
          <span class="perch">
            <ClaudeMascot :size="44" :state="view.state === 'asking' ? 'thinking' : 'idle'" />
          </span>
          <div class="words">
            <p v-if="view.state === 'asking'" class="thinking shimmer">{{ thinking }}…</p>
            <Prose v-else-if="view.turn.answer" :value="view.turn.answer" />
            <p v-else class="failure" role="alert">{{ view.turn.failure }}</p>
          </div>
        </div>

        <footer class="foot">
          <span class="mono-meta">{{ footLine }}</span>
          <button
            v-if="view.state === 'answered'"
            v-press
            class="secondary focusable"
            type="button"
            :disabled="sessionState === 'gone' || view.turn.isSent"
            :title="
              sessionState === 'gone'
                ? 'The session is gone, so nothing can be sent to it'
                : 'Send the question and answer as your next message'
            "
            @click="emit('send', view.turn)"
          >
            {{ view.turn.isSent ? "Sent" : "Send to session" }}
          </button>
          <button
            v-else-if="view.state === 'failed'"
            v-press
            class="secondary focusable"
            type="button"
            @click="submit(view.turn.question)"
          >
            Ask again
          </button>
        </footer>
      </section>

      <div class="row">
        <ComposerSessionPerch />
        <UiTextarea
          v-model="draft"
          auto-fit
          class="field focusable"
          variant="bare"
          :rows="1"
          :placeholder="view.turn ? 'Ask a follow-up…' : 'Ask Claude about this conversation…'"
          aria-label="Ask Claude"
        />
        <button
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
  box-sizing: border-box;
  width: min(600px, 100%);
}

/* Bounded like the rest of the dock, so a long answer scrolls instead of pushing the header off the top. */
.body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: calc(100vh - var(--stage-top) - var(--gutter));
  min-height: 0;
  padding: 6px 6px 6px 8px;
}

.thread {
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 2px;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 8px 2px;
  scrollbar-width: thin;
}

.head {
  align-items: center;
  display: flex;
  gap: 2px;
  padding: 5px 2px 0 4px;
}

.title {
  color: var(--ink);
  flex: none;
  font-size: 11.5px;
  font-weight: 600;
  margin-right: 6px;
}

.state {
  color: var(--subtle);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state[data-state="failed"] {
  color: var(--error);
}

.count {
  color: var(--subtle);
}

.dismiss {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
}

.dismiss:hover {
  background: var(--sunken);
  color: var(--ink);
}

.asked {
  align-items: flex-end;
  align-self: flex-end;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 92%;
}

.asked .mono-meta {
  color: var(--subtle);
}

.bubble {
  background: var(--primary-soft);
  border-radius: var(--radius-box);
  color: var(--ink);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  padding: 8px 12px;
  white-space: pre-wrap;
}

.reply {
  align-items: flex-start;
  display: flex;
  gap: 8px;
}

.perch {
  align-items: center;
  display: flex;
  flex: none;
  height: 44px;
  justify-content: center;
  width: 50px;
}

.words {
  flex: 1;
  font-size: 13px;
  line-height: 1.55;
  min-width: 0;
  padding-top: 4px;
}

.thinking {
  color: var(--muted);
  font-size: 12.5px;
  font-style: italic;
  margin: 0;
  padding-top: 2px;
}

.failure {
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-field);
  color: var(--error);
  margin: 0;
  padding: 8px 12px;
}

.foot {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  min-height: 28px;
  padding-left: 58px;
}

.foot .mono-meta {
  color: var(--subtle);
}

.secondary {
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  flex: none;
  font-family: var(--sans);
  font-size: 11.5px;
  font-weight: 600;
  height: 26px;
  padding: 0 11px;
}

.secondary:disabled {
  cursor: default;
  opacity: 0.45;
}

.row {
  align-items: flex-end;
  display: flex;
  flex: none;
  gap: 8px;
  min-height: 36px;
  padding: 2px 4px 3px 2px;
}

/* auto-fit grows the box and hides its overflow; the cap is this call site's, so scrolling comes back with it. */
.row :deep(.textarea[data-auto-fit="true"]) {
  max-height: 112px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.field {
  align-self: center;
  flex: 1;
  min-width: 0;
}

.ask {
  align-items: center;
  background: var(--ink);
  border: 0;
  border-radius: 999px;
  color: var(--canvas);
  cursor: pointer;
  display: inline-flex;
  flex: none;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 600;
  gap: 8px;
  height: 30px;
  padding: 0 12px;
  white-space: nowrap;
}

.ask:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>
