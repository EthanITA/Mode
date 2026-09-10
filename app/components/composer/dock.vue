<script lang="ts" setup>
import { ChevronUp } from "@lucide/vue";
import type { TranscriptState } from "./transcript.vue";

const convo = useConversation();
const tray = useTray();
const { liveState, steps } = useScreen();
const chrome = useChrome();

const state = ref<TranscriptState>("preview");
const remembered = ref<TranscriptState>("preview");

const working = computed(() => convo.mascot.value !== "idle");
const shrunk = computed(() => state.value === "minimized");
// Minimized hides Claude's output entirely, so the mascot keeps its place beside the prompt.
const perched = computed(() => !working.value || shrunk.value);

watch(
  () => chrome.islands.shelved.value,
  (on) => {
    if (on) {
      remembered.value = state.value;
      state.value = "minimized";
      return;
    }
    state.value = remembered.value;
  },
  { immediate: true },
);

const load = computed(() => {
  const comments = tray.items.value.filter((item) => item.kind !== "task").length;
  const tasks = tray.count.value - comments;
  const parts: string[] = [];
  if (comments) parts.push(plural(comments, "comment"));
  if (tasks) parts.push(plural(tasks, "task"));
  return parts.join(" + ");
});

const placeholder = computed(() => {
  if (!convo.live.value) return "This session is not live, so you cannot write to it";
  return tray.count.value ? "Add a line, or just send what is waiting…" : "Prompt this session…";
});

const ready = computed(() => convo.live.value && !convo.sending.value && !!(convo.draft.value.trim() || tray.count.value));

const walk = computed(() => steps.value.map((step) => step.label).join(" → "));

async function send(): Promise<void> {
  if (!ready.value) return;
  const handover = tray.handOver(convo.draft.value);
  if (!handover.text) return;
  if (!(await convo.deliver(handover.text))) return;
  handover.settle();
  convo.draft.value = "";
  if (state.value === "minimized") state.value = "preview";
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void send();
}

async function command(text: string): Promise<void> {
  await convo.deliver(text);
}

onMounted(() => {
  // The chips are deliberately not persisted, so a refresh would drop typed words with no receipt.
  function warn(event: BeforeUnloadEvent): void {
    if (!tray.count.value) return;
    event.preventDefault();
  }

  window.addEventListener("beforeunload", warn);
  onScopeDispose(() => window.removeEventListener("beforeunload", warn));
});
</script>

<template>
  <div class="dock" :data-state="state" data-region="composer-dock">
    <ComposerTray />

    <UiSurface
      class="island"
      variant="glass-liquid"
      shape="island"
      pad="none"
      :responsive="{ axis: 'height', anchorY: 'end' }"
    >
      <div class="island-body">
        <ComposerTranscript
          :mascot="convo.mascot.value"
          :porting="convo.porting.value"
          :state="state"
          :beat="convo.beat.value"
          :turns="convo.turns.value"
          @minimize="state = 'minimized'"
          @toggle="state = state === 'expanded' ? 'preview' : 'expanded'"
        />

        <div class="row">
          <UiIconButton
            v-if="shrunk"
            :icon="ChevronUp"
            label="Show the transcript"
            size="xs"
            @click="state = 'preview'"
          >
            {{ plural(convo.turns.value.length, "turn") }}
          </UiIconButton>

          <span class="perch">
            <ClaudeMascot :porting="convo.porting.value" :show="perched" :size="40" :state="convo.mascot.value" />
          </span>

          <UiTextarea
            v-model="convo.draft.value"
            auto-fit
            class="prompt focusable"
            variant="bare"
            :rows="1"
            :placeholder="placeholder"
            :disabled="!convo.live.value"
            aria-label="Prompt this session"
            @keydown="onKey"
          />

          <button v-press class="send focusable" type="button" :disabled="!ready" @click="send">
            {{ load ? `Send ${load}` : "Send" }}
            <span class="key mono-meta">↵</span>
          </button>
        </div>

        <div class="slots">
          <ComposerPicker axis="mode" @pick="command" />
          <ComposerPicker axis="style" @pick="command" />

          <span
            v-if="steps.length"
            class="bars"
            :title="walk"
            data-cmt="pipeline"
            data-cmt-label="Pipeline"
            data-cmt-tell="About where this conversation is in its pipeline"
            :data-cmt-excerpt="walk"
          >
            <i v-for="step in steps" :key="step.label" class="bar" :data-state="step.state" :data-gate="step.gate" />
          </span>

          <span class="live mono-meta" :data-live="liveState.running">
            <span class="dot" />
            {{ liveState.label }}
          </span>
        </div>

      </div>
    </UiSurface>

    <p v-if="convo.error.value" class="failure" role="alert">{{ convo.error.value }}</p>
  </div>
</template>

<style scoped>
/* Fills the foot row's flexible cell, so the prompt grows with the window and stops
   where the board begins. */
.dock {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.island {
  box-sizing: border-box;
  width: 100%;
}

.island-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 6px 6px 8px;
}

/* Fixed, so the row keeps its shape through the gap between vanishing and arriving. */
.perch {
  align-items: center;
  display: flex;
  flex: none;
  height: 40px;
  justify-content: center;
  width: 45px;
}


.row {
  align-items: flex-end;
  display: flex;
  gap: 10px;
  min-height: 36px;
  padding: 2px 4px 3px 8px;
}

/* auto-fit grows the box and hides its overflow; the cap is this call site's, so scrolling comes back with it. */
.row :deep(.textarea[data-auto-fit="true"]) {
  max-height: 112px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.prompt {
  flex: 1;
  min-width: 0;
}


.send {
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

.send:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.key {
  opacity: 0.7;
}

.slots {
  align-items: center;
  display: flex;
  gap: 6px;
  height: 30px;
  padding: 0 4px 0 2px;
}

.bars {
  display: inline-flex;
  gap: 3px;
  margin-left: auto;
}

.bar {
  background: var(--border-strong);
  border-radius: 2px;
  display: block;
  height: 3px;
  width: 14px;
}

.bar[data-state="done"] {
  background: var(--ink);
}

.bar[data-state="current"] {
  background: var(--primary);
}

.bar[data-gate="true"] {
  background: var(--warning);
}

.live {
  align-items: center;
  color: var(--subtle);
  display: flex;
  flex: none;
  gap: 5px;
  margin-left: auto;
}

.bars ~ .live {
  margin-left: 0;
}

.live .dot {
  --dot-size: 6px;

  background: var(--subtle);
}

.live[data-live="true"] {
  color: var(--success);
}

/* No token is this slow — a breath at spotlight speed reads as anxious rather than alive. */
.live[data-live="true"] .dot {
  animation: breathe calc(var(--duration-spotlight) * 2) var(--ease-in-out) infinite;
  background: var(--success);
}

@keyframes breathe {
  50% {
    opacity: 0.35;
  }
}

.failure {
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-field);
  color: var(--error);
  font-size: 13px;
  margin: 0;
  padding: 9px 13px;
}

@media (prefers-reduced-motion: reduce) {
  .live[data-live="true"] .dot {
    animation: none;
  }
}
</style>
