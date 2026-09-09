<script lang="ts">
export type TranscriptState = "expanded" | "minimized" | "preview";
</script>

<script lang="ts" setup>
import { ChevronUp, Minus } from "@lucide/vue";
import type { ConversationTurn } from "~/composables/useConversation";

const { state, turns } = defineProps<{ state: TranscriptState; turns: ConversationTurn[] }>();

defineEmits<{ minimize: []; toggle: [] }>();

const EXCERPT = 200;

const scroller = ref<HTMLElement>();

const expanded = computed(() => state === "expanded");
const last = computed(() => turns.at(-1));

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

function toBottom(): void {
  const box = scroller.value;
  if (box) box.scrollTop = box.scrollHeight;
}

watch([() => turns.length, () => state], () => nextTick(toBottom), { flush: "post" });
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

      <div v-if="state === 'preview'" class="preview">
        <p class="line">{{ last?.text || "Nothing in this conversation yet." }}</p>
      </div>

      <div v-if="state === 'expanded'" ref="scroller" class="turns">
        <article
          v-for="(turn, index) in turns"
          :key="`${turn.at}:${turn.role}:${index}`"
          class="turn"
          :data-role="turn.role"
          data-cmt="turn"
          :data-cmt-label="`${who(turn)} · ${ageOf(turn)}`"
          :data-cmt-tell="tell(turn)"
          :data-cmt-excerpt="turn.text.slice(0, EXCERPT)"
        >
          <span class="who mono-meta">{{ who(turn) }} · {{ ageOf(turn) }}</span>
          <Prose class="text" :value="turn.text" />
        </article>
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

.line {
  color: var(--ink);
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  overflow: hidden;
  padding: 0 8px 10px 6px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.turns {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 38vh;
  overflow-y: auto;
  padding: 0 4px 8px 2px;
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

@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
</style>
