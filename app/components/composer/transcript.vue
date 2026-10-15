<script lang="ts">
export type TranscriptState = "expanded" | "minimized" | "preview";
</script>

<script lang="ts" setup>
import { ChevronUp, Minus } from "@lucide/vue";
import type { MascotState } from "~/components/claude/mascot.vue";
import type { Beat, ConversationTurn } from "~/composables/useConversation";

const { beat, mascot, porting, state, turns } = defineProps<{
  beat?: Beat;
  mascot: MascotState;
  porting?: boolean;
  state: TranscriptState;
  turns: ConversationTurn[];
}>();

const working = computed(() => mascot !== "idle");

// A new narration replaces the whole beat, so a question still in it is one nobody has answered.
const asking = computed(() => beat?.actions.findLast((one) => one.ask)?.ask);

defineEmits<{ answer: [text: string]; minimize: []; toggle: [] }>();

const EXCERPT = 200;

const scroller = ref<HTMLElement>();

const expanded = computed(() => state === "expanded");
const last = computed(() => turns.at(-1));
const answer = computed(() => freshAnswer(turns));
// Where the newest thing is: at the foot of a history or a running beat, at the head of a settled reply.
const tail = computed(() => expanded.value || !!beat || working.value || !!porting);

const meta = computed(() => {
  if (!last.value) return "nothing yet";
  const age = ageOf(last.value);
  return age ? `${plural(turns.length, "turn")} · ${age}` : plural(turns.length, "turn");
});

function ageOf(turn: ConversationTurn): string {
  return relativeAge(new Date(turn.at).toISOString());
}

function who(turn: ConversationTurn): string {
  return turn.role === "user" ? "you" : "claude";
}

function tell(turn: ConversationTurn): string {
  return turn.role === "user"
    ? `About my own message from ${ageOf(turn)} ago in this conversation`
    : `About your reply from ${ageOf(turn)} ago in this conversation`;
}

function reveal(): void {
  const box = scroller.value;
  if (box) box.scrollTop = tail.value ? box.scrollHeight : 0;
}

watch(
  [() => turns.length, () => state, () => tail.value, () => beat?.head?.at, () => beat?.actions.length],
  () => nextTick(reveal),
  { flush: "post" },
);
</script>

<template>
  <div class="transcript" :data-state="state" data-region="composer-transcript">
    <template v-if="state !== 'minimized'">
      <div class="head">
        <button
          v-press
          class="grow focusable"
          type="button"
          :title="expanded ? 'Collapse to the last turn' : 'Show the whole transcript'"
          :aria-expanded="expanded"
          @click="$emit('toggle')"
        >
          <span class="dot" :data-role="last?.role" />
          <span class="label">Transcript</span>
          <span class="meta mono-meta">{{ meta }}</span>
          <span class="chevron"><UiIcon :icon="ChevronUp" size="xs" /></span>
        </button>
        <UiIconButton :icon="Minus" label="Minimize · just the prompt" size="xs" @click="$emit('minimize')" />
      </div>

      <div ref="scroller" class="body">
        <div v-if="state === 'expanded'" class="turns">
          <template v-for="(turn, index) in turns" :key="`${turn.at}:${turn.role}:${index}`">
            <p v-if="turn.role === 'system'" class="note mono-meta" data-region="system-note">
              {{ turn.text }}
            </p>

            <article
              v-else
              class="turn"
              :data-queued="turn.queued"
              :data-role="turn.role"
              data-cmt="turn"
              :data-cmt-label="`${who(turn)} · ${ageOf(turn)}`"
              :data-cmt-tell="tell(turn)"
              :data-cmt-excerpt="turn.text.slice(0, EXCERPT)"
            >
              <span class="who mono-meta">
                {{ who(turn) }} · {{ ageOf(turn) }}<template v-if="turn.queued"> · queued</template>
              </span>
              <ComposerTurnText class="text" :value="turn.text" />
            </article>
          </template>
        </div>

        <div class="stage" :data-state="state">
          <span class="perch" data-region="transcript-perch">
            <ClaudeMascot :porting="porting" :show="working" :size="44" :state="mascot" />
          </span>

          <div class="stage-body">
            <Transition name="swap">
              <div
                v-if="beat"
                key="beat"
                class="beat"
                data-region="beat"
                data-cmt="beat"
                data-cmt-label="claude · right now"
                data-cmt-tell="About what you are doing right now in this conversation"
                :data-cmt-excerpt="beat.head?.text.slice(0, EXCERPT)"
              >
                <Transition name="think">
                  <p v-if="!beat.head" key="wait" class="beat-text shimmer" data-waiting="true">
                    Thinking<span class="dots" />
                  </p>

                  <ComposerTurnText
                    v-else
                    :key="beat.head.at"
                    class="beat-text"
                    :data-thinking="beat.head.kind === 'thinking'"
                    :value="beat.head.text"
                  />
                </Transition>

                <ComposerActionLine
                  v-if="beat.actions.length"
                  class="acts"
                  :actions="beat.actions"
                  :busy="mascot === 'running'"
                />

                <ComposerAsk v-if="asking" :ask="asking" @pick="$emit('answer', $event)" />
              </div>

              <ComposerTurnText
                v-else-if="state === 'preview' && answer"
                key="answer"
                class="answer"
                data-cmt="turn"
                :data-cmt-label="`${who(answer)} · ${ageOf(answer)}`"
                :data-cmt-tell="tell(answer)"
                :data-cmt-excerpt="answer.text.slice(0, EXCERPT)"
                :value="answer.text"
              />

              <p v-else-if="state === 'preview'" key="empty" class="empty mono-meta">
                Nothing in this conversation yet.
              </p>
            </Transition>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Shrinkable, so a squeezed island takes it out of the scroller rather than the header. */
.transcript {
  @apply flex min-h-0 flex-initial flex-col;
}

.transcript[data-state="preview"],
.transcript[data-state="expanded"] {
  @apply mb-0.5 border-b border-b-border;
}

/* Never shrinks: it is the row that disappears first when the island is squeezed. */
.head {
  @apply flex flex-none items-center gap-0.5 px-1.5 pt-1.25 pb-1.75;
}

.grow {
  @apply flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent bg-none p-0 text-left text-inherit;
}

.dot {
  @apply size-1.75 flex-none rounded-full bg-subtle;
}

.dot[data-role="assistant"] {
  @apply bg-primary;
}

.dot[data-role="user"] {
  @apply bg-warning;
}

.label {
  @apply flex-none typo-caption-strong text-fg;
}

.meta {
  @apply min-w-0 flex-1 truncate text-subtle;
}

.chevron {
  @apply flex flex-none items-center justify-center text-muted transition-transform duration-(--duration-moderate) ease-out;
}

.transcript[data-state="expanded"] .chevron {
  @apply rotate-180;
}

/* The one scroller, and the head is not in it: the dock grows upward, so two stacked
   scrollers here pushed the head off the top of the screen. It never grows past its
   content and always shrinks below the cap when the island is squeezed. */
.body {
  @apply flex max-h-(--transcript-max-h) min-h-0 flex-initial scrollbar-thin flex-col gap-2.5 overflow-y-auto pt-0 pr-1 pb-2 pl-0.5;
}

/* Preview is the ambient default (one turn, no history), so it gets the tighter cap. */
.transcript[data-state="preview"] .body {
  @apply max-h-(--transcript-preview-max-h);
}

/* A row: the perch is a fixed-size sibling of the swapped text, so the mascot never changes the
   text's box when it teleports in or out. */
.stage {
  @apply relative flex flex-none items-start gap-2;
}

.stage-body {
  @apply relative min-w-0 flex-1;
}

.answer {
  @apply min-w-0 typo-body wrap-anywhere text-fg;
}

.empty {
  @apply m-0 text-subtle;
}

.turns {
  @apply flex flex-none flex-col gap-2.5;
}

.turn {
  @apply flex max-w-11/12 flex-col gap-1;
}

.turn[data-role="assistant"] {
  @apply self-start;
}

.turn[data-role="user"] {
  @apply items-end self-end;
}

.who {
  @apply text-subtle;
}

.text {
  @apply m-0 rounded-box bg-sunken px-3 py-2;
}

.turn[data-role="user"] .text {
  @apply bg-primary-soft;
}

/* Sent but not yet picked up, so it reads as pending rather than as part of the exchange. */
.turn[data-queued="true"] .text {
  @apply border border-dashed border-border-strong bg-transparent bg-none;
}

.beat {
  @apply flex min-w-0 flex-col gap-1.5;
}

/* Fixed, so the row keeps its shape through the gap between vanishing and arriving. Always
   mounted: the box never changes when the mascot teleports in or out. */
.perch {
  @apply flex h-11 w-12.5 flex-none items-center justify-center;
}

.perch.small {
  @apply h-8.5 w-9.5;
}

.beat-text[data-waiting="true"] {
  @apply italic;
}

.dots::after {
  @apply content-[''];
  animation: dots 1.4s steps(1, end) infinite;
}

@keyframes dots {
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

/* Wraps in full: neither the narration nor an action line may be clipped. */
.beat-text {
  @apply m-0 min-w-0 pt-1.5 typo-body wrap-anywhere text-muted;
}

/* Prose renders at the transcript's size, so it is scaled down to a narration's weight here. */
.beat-text :deep(p),
.beat-text :deep(li) {
  @apply m-0 typo-body;
}

.beat-text :deep(code) {
  @apply typo-caption;
}

.beat-text :deep(strong) {
  @apply font-semibold text-fg;
}

.beat-text[data-thinking="true"] {
  @apply text-subtle italic;
}

.acts {
  @apply pl-13;
}

.note {
  @apply m-0 self-center text-subtle opacity-85;
}

/* Held back until the outgoing one has gone, so two paragraphs never overlap mid-fade. */
.swap-enter-active,
.think-enter-active {
  @apply transition-opacity delay-(--duration-fast) duration-(--duration-moderate) ease-out;
}

/* Out of flow, so the arriving text sets the height and the box tweens to it instead of snapping. */
.swap-leave-active,
.think-leave-active {
  @apply absolute inset-x-0 top-0 bottom-auto transition-opacity duration-(--duration-fast) ease-out;
}

.swap-enter-from,
.swap-leave-to,
.think-enter-from,
.think-leave-to {
  @apply opacity-0;
}

@media (prefers-reduced-motion: reduce) {
  .chevron,
  .swap-enter-active,
  .swap-leave-active,
  .think-enter-active,
  .think-leave-active {
    @apply transition-none;
  }
}
</style>
