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

defineEmits<{ minimize: []; toggle: [] }>();

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
          <Transition name="swap">
            <article v-if="beat || working || porting" class="turn beat" data-region="beat">
              <div class="beat-head">
                <span class="perch">
                  <ClaudeMascot :porting="porting" :show="working" :size="44" :state="mascot" />
                </span>

                <div class="beat-say">
                  <Transition name="think">
                    <p v-if="!beat?.head" key="wait" class="beat-text shimmer" data-waiting="true">
                      Thinking<span class="dots" />
                    </p>

                    <ComposerTurnText
                      v-else
                      :key="beat!.head!.at"
                      class="beat-text"
                      :data-thinking="beat!.head!.kind === 'thinking'"
                      :value="beat!.head!.text"
                    />
                  </Transition>
                </div>
              </div>

              <ComposerActionLine
                v-if="beat?.actions.length"
                class="acts"
                :actions="beat.actions"
                :busy="mascot === 'running'"
              />
            </article>

            <ComposerTurnText
              v-else-if="state === 'preview' && answer"
              class="answer"
              :value="answer.text"
            />

            <p v-else-if="state === 'preview'" class="empty mono-meta">Nothing in this conversation yet.</p>
          </Transition>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.transcript {
  display: flex;
  flex-direction: column;
}

.transcript[data-state="preview"],
.transcript[data-state="expanded"] {
  border-bottom: 1px solid var(--border);
  margin-bottom: 2px;
}

.head {
  align-items: center;
  display: flex;
  gap: 2px;
  padding: 5px 6px 7px;
}

.grow {
  align-items: center;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: flex;
  flex: 1;
  font: inherit;
  gap: 8px;
  min-width: 0;
  padding: 0;
  text-align: left;
}

.dot {
  background: var(--subtle);
  border-radius: 999px;
  flex: none;
  height: 7px;
  width: 7px;
}

.dot[data-role="assistant"] {
  background: var(--primary);
}

.dot[data-role="user"] {
  background: var(--warning);
}

.label {
  color: var(--ink);
  flex: none;
  font-size: 11.5px;
  font-weight: 600;
}

.meta {
  color: var(--subtle);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  align-items: center;
  color: var(--muted);
  display: flex;
  flex: none;
  justify-content: center;
  transition: transform var(--duration-moderate) var(--ease-out);
}

.transcript[data-state="expanded"] .chevron {
  transform: rotate(180deg);
}

/* The one scroller, and the head is not in it: the dock grows upward, so two stacked
   scrollers here pushed the head off the top of the screen. */
.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: var(--transcript-max-h);
  overflow-y: auto;
  padding: 0 4px 8px 2px;
  scrollbar-width: thin;
}

/* Positioned, so a leaving beat or answer is contained here rather than escaping the island. */
.stage {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.stage:empty {
  display: none;
}

.answer {
  color: var(--ink);
  font-size: 13px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.empty {
  color: var(--subtle);
  margin: 0;
}

.turns {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 10px;
}

.turn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 92%;
}

.turn[data-role="assistant"] {
  align-self: flex-start;
}

.turn[data-role="user"] {
  align-items: flex-end;
  align-self: flex-end;
}

.who {
  color: var(--subtle);
}

.text {
  background: var(--sunken);
  border-radius: var(--radius-box);
  margin: 0;
  padding: 8px 12px;
}

.turn[data-role="user"] .text {
  background: var(--primary-soft);
}

/* Sent but not yet picked up, so it reads as pending rather than as part of the exchange. */
.turn[data-queued="true"] .text {
  background: none;
  border: 1px dashed var(--border-strong);
}

.beat {
  align-self: flex-start;
  gap: 6px;
  max-width: 100%;
}

.beat-head {
  align-items: flex-start;
  display: flex;
  gap: 8px;
}

/* The narration's own column, positioned: an abspos leaver in a flex row would snap to the perch. */
.beat-say {
  flex: 1;
  min-width: 0;
  position: relative;
}

/* Fixed, so the row keeps its shape through the gap between vanishing and arriving. */
.perch {
  align-items: center;
  display: flex;
  flex: none;
  height: 44px;
  justify-content: center;
  width: 50px;
}

.perch.small {
  height: 34px;
  width: 38px;
}

.beat-text[data-waiting="true"] {
  font-style: italic;
}

.dots::after {
  animation: dots 1.4s steps(1, end) infinite;
  content: "";
}

@keyframes dots {
  0% { content: ""; }
  25% { content: "."; }
  50% { content: ".."; }
  75% { content: "..."; }
}

/* Wraps in full: neither the narration nor an action line may be clipped. */
.beat-text {
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.5;
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  padding-top: 6px;
}

/* Prose renders at the transcript's size, so it is scaled down to a narration's weight here. */
.beat-text :deep(p),
.beat-text :deep(li) {
  font-size: 12.5px;
  margin: 0;
}

.beat-text :deep(code) {
  font-size: 11.5px;
}

.beat-text :deep(strong) {
  color: var(--ink);
  font-weight: 600;
}

.beat-text[data-thinking="true"] {
  color: var(--subtle);
  font-style: italic;
}

.acts {
  padding-left: 52px;
}

.note {
  align-self: center;
  color: var(--subtle);
  margin: 0;
  opacity: 0.85;
}

/* Held back until the outgoing one has gone, so two paragraphs never overlap mid-fade. */
.swap-enter-active,
.think-enter-active {
  transition: opacity var(--duration-moderate) var(--ease-out) var(--duration-fast);
}

/* Out of flow, so the arriving text sets the height and the box tweens to it instead of snapping. */
.swap-leave-active,
.think-leave-active {
  inset: 0 0 auto;
  position: absolute;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.swap-enter-from,
.swap-leave-to,
.think-enter-from,
.think-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .chevron,
  .swap-enter-active,
  .swap-leave-active,
  .think-enter-active,
  .think-leave-active {
    transition: none;
  }
}
</style>
