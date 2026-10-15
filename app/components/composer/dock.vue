<script lang="ts" setup>
import { ChevronUp } from "@lucide/vue";
import type { TranscriptState } from "./transcript.vue";

const { compact = false } = defineProps<{ compact?: boolean }>();

const convo = useConversation();
const tray = useTray();
const { liveState, steps } = useScreen();
const chrome = useChrome();

// Shared state: a page navigation must not reset how open the panel is.
const state = useState<TranscriptState>("sc:transcript-state", () => "minimized");
const remembered = useState<TranscriptState>("sc:transcript-remembered", () => "minimized");

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
  const comments = tray.items.value.filter((item) => item.kind !== "task" && !item.isSent).length;
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

const ready = computed(
  () => convo.live.value && !convo.sending.value && !!(convo.draft.value.trim() || tray.count.value),
);

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

// Compact starts closed over the artifact; engagement opens it, and it never auto-closes.
function onFocus(): void {
  if (compact && state.value === "minimized") state.value = "preview";
}

watch(working, (now) => {
  if (compact && now && state.value === "minimized") state.value = "preview";
});

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
  <div class="dock" :data-compact="compact" :data-state="state" data-region="composer-dock">
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
          @answer="command"
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
            @focus="onFocus"
            @keydown="onKey"
          />

          <button
            v-press
            class="send focusable"
            type="button"
            data-tip="Send · {enter}"
            :disabled="!ready"
            @click="send"
          >
            {{ load ? `Send ${load}` : "Send" }}
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
  @apply flex w-full flex-col gap-2;
}

.island {
  @apply w-full;
}

/* Closed over the artifact by default: a slim pill, not a panel competing with the reading
   surface. Growing back to the full cell width is what "engaging with it" earns. */
.dock[data-compact="true"][data-state="minimized"] .island {
  @apply max-w-90 transition-all duration-(--duration-base) ease-out;
}

/* The island is bottom-anchored inside a clipping box, so whatever does not fit is cut
   off the top, where the header is. Bounding the measured content is what stops that. */
.island-body {
  @apply flex max-h-[calc(100vh_-_var(--stage-top)_-_var(--gutter))] min-h-0 flex-col gap-1 py-1.5 pr-1.5 pl-2;
}

/* Fixed, so the row keeps its shape through the gap between vanishing and arriving. */
.perch {
  @apply flex h-10 w-11.25 flex-none items-center justify-center;
}

.row {
  @apply flex min-h-9 flex-none items-end gap-2.5 pt-0.5 pr-1 pb-0.75 pl-2;
}

/* auto-fit grows the box and hides its overflow; the cap is this call site's, so scrolling comes back with it. */
.row :deep(.textarea[data-auto-fit="true"]) {
  @apply max-h-28 scrollbar-thin overflow-y-auto;
}

.prompt {
  @apply min-w-0 flex-1;
}

.send {
  @apply inline-flex h-7.5 flex-none cursor-pointer items-center gap-2 rounded-full border-0 bg-fg px-3 py-0 font-sans typo-caption-strong whitespace-nowrap text-canvas;
}

.send:disabled {
  @apply cursor-not-allowed opacity-45;
}

.slots {
  @apply flex h-7.5 flex-none items-center gap-1.5 py-0 pr-1 pl-0.5;
}

.bars {
  @apply ml-auto inline-flex gap-0.75;
}

.bar {
  @apply block h-0.75 w-3.5 rounded-xs bg-border-strong;
}

.bar[data-state="done"] {
  @apply bg-fg;
}

.bar[data-state="current"] {
  @apply bg-primary;
}

.bar[data-gate="true"] {
  @apply bg-warning;
}

.live {
  @apply ml-auto flex flex-none items-center gap-1.25 text-subtle;
}

.bars ~ .live {
  @apply ml-0;
}

.live .dot {
  @apply bg-subtle;
  --dot-size: 6px;
}

.live[data-live="true"] {
  @apply text-success;
}

/* No token is this slow — a breath at spotlight speed reads as anxious rather than alive. */
.live[data-live="true"] .dot {
  @apply bg-success;
  animation: breathe calc(var(--duration-spotlight) * 2) var(--ease-in-out) infinite;
}

@keyframes breathe {
  50% {
    opacity: 0.35;
  }
}

.failure {
  @apply m-0 rounded-field border border-error bg-error-soft px-3.25 py-2.25 typo-body text-error;
}

@media (prefers-reduced-motion: reduce) {
  .live[data-live="true"] .dot {
    @apply animate-none;
  }
}
</style>
