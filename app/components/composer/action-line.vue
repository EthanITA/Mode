<script lang="ts" setup>
import type { ConversationTurn } from "~/composables/useConversation";

const { actions, busy = false } = defineProps<{ actions: ConversationTurn[]; busy?: boolean }>();

// Bastian's cadence, from ChatMessageLoading in mf-ui-components: type it out, hold, then advance.
const TYPE_MS = 30;
const HOLD_MS = 1_200;

const at = ref(0);
const chars = ref(0);
let timer: ReturnType<typeof setTimeout> | undefined;

const line = computed(() => {
  const turn = actions[at.value] ?? actions.at(-1);
  if (!turn) return "";
  // Bash carries a sentence describing itself, so a call wrapper around it is noise.
  if (turn.tool === "Bash" && turn.arg) return turn.arg;
  return turn.arg ? `${turn.tool}(${turn.arg})` : `${turn.tool}()`;
});

const shown = computed(() => line.value.slice(0, chars.value));
const typing = computed(() => chars.value < line.value.length);

function tick(): void {
  clearTimeout(timer);
  if (typing.value) {
    timer = setTimeout(() => { chars.value += 1; }, TYPE_MS);
    return;
  }
  // Nothing left to advance to means this is what it is doing now, so it stays put.
  if (at.value >= actions.length - 1) return;
  timer = setTimeout(() => {
    at.value += 1;
    chars.value = 0;
  }, HOLD_MS);
}

watch([shown, () => actions.length], tick, { immediate: true });

watch(
  () => actions.length,
  (now, before = 0) => {
    // A new beat resets the queue; a longer one keeps its place so nothing is skipped.
    if (now >= before) return;
    at.value = 0;
    chars.value = 0;
  },
);

onScopeDispose(() => clearTimeout(timer));
</script>

<template>
  <p v-if="line" class="act mono-meta" :class="{ shimmer: busy }" data-region="action">
    <span class="caret">›</span>{{ shown }}<span v-if="typing" class="cursor" />
  </p>
</template>

<style scoped>
/* Wraps rather than clipping: a path or a command is the whole point of showing the line. */
.act {
  color: var(--subtle);
  display: block;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.caret {
  color: var(--muted);
  margin-right: 5px;
}

.cursor {
  animation: blink-cursor 1s steps(1, end) infinite;
  background: var(--subtle);
  display: inline-block;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  width: 0.45em;
}

@keyframes blink-cursor {
  50% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .act,
  .cursor {
    animation: none;
  }
}
</style>
