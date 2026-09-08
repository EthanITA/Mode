<script lang="ts" setup>
import type { HistoryTurn } from "~/composables/useHistory";

const { turn, selected = false } = defineProps<{ turn: HistoryTurn; selected?: boolean }>();
defineEmits<{ select: [] }>();

const age = computed(() => relativeAge(new Date(turn.receipt.at).toISOString()));
const agents = computed(() => turn.receipt.by ?? []);
const touched = computed(() => turn.receipt.wrote.length + turn.receipt.deleted.length);
const failures = computed(() => turn.receipt.ran.filter((one) => one.failed).length);
const label = computed(() => (turn.inFlight ? "In progress" : `Turn ${turn.receipt.turn}`));

const tell = computed(() => {
  const who = agents.value.length ? agents.value.map(authorOf).join(" and ") : "you";
  const what = touched.value ? `where ${who} changed ${plural(touched.value, "file")}` : "which changed no files";
  return `About ${label.value.toLowerCase()}, ${what}:`;
});
</script>

<template>
  <button
    v-press
    class="turn focusable plain-button"
    type="button"
    :data-selected="selected"
    :data-in-flight="turn.inFlight"
    data-cmt="turn"
    :data-cmt-label="label"
    :data-cmt-tell="tell"
    :data-cmt-excerpt="turn.receipt.prompt"
    @click="$emit('select')"
  >
    <span class="head">
      <span class="label mono-meta">{{ label }}</span>
      <span v-if="age" class="age mono-meta">{{ age }}</span>
      <span class="spacer" />
      <!-- A turn that named no agent was the session acting alone, which is not the same as unattributed. -->
      <span v-for="agent in agents" :key="agent" class="agent mono-meta">{{ authorOf(agent) }}</span>
    </span>

    <span v-if="turn.inFlight" class="pending mono-meta">
      work that landed after the session went quiet, not yet part of a closed turn
    </span>

    <span v-if="turn.receipt.prompt" class="say">
      <span class="mark" data-who="you">Y</span>
      <span class="text">{{ turn.receipt.prompt }}</span>
    </span>

    <span v-if="turn.reply" class="say">
      <span class="mark" data-who="claude">C</span>
      <span class="text" data-reply>{{ turn.reply }}</span>
    </span>

    <span class="receipts">
      <span v-if="turn.receipt.read.length" class="chip mono-meta">{{ plural(turn.receipt.read.length, "read") }}</span>
      <span v-if="touched" class="chip mono-meta" data-kind="wrote">{{ plural(touched, "file") }}</span>
      <span v-if="turn.receipt.ran.length" class="chip mono-meta">{{ plural(turn.receipt.ran.length, "command") }}</span>
      <span v-if="failures" class="chip mono-meta" data-kind="failed">{{ failures }} failed</span>
      <span v-if="!touched" class="chip mono-meta" data-kind="none">no files</span>
      <!-- Spawns are shown so an agent never appears in the attribution from nowhere. -->
      <span v-for="name in turn.spawned" :key="name" class="chip mono-meta" data-kind="spawned">spawned {{ name }}</span>
    </span>
  </button>
</template>

<style scoped>
.turn {
  border: 1px solid transparent;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  text-align: left;
  transition: background var(--duration-fast) ease-out;
  width: 100%;
}

.turn:hover {
  background: var(--sunken);
}

.turn[data-selected="true"] {
  background: var(--sunken);
  border-color: var(--border-strong);
}

.turn[data-in-flight="true"] {
  border-color: var(--primary-soft);
  border-style: dashed;
}

.head {
  align-items: center;
  display: flex;
  gap: 8px;
}

.spacer {
  flex: 1;
}

.label {
  color: var(--ink);
}

.turn[data-selected="true"] .label {
  color: var(--primary);
}

.turn[data-in-flight="true"] .label {
  color: var(--primary);
}

.age,
.chip {
  color: var(--subtle);
}

.agent {
  background: var(--primary-soft);
  border-radius: 999px;
  color: var(--primary-deep);
  padding: 2px 7px;
  text-transform: none;
}

.pending {
  color: var(--muted);
  line-height: 1.5;
  text-transform: none;
}

.say {
  display: flex;
  gap: 8px;
}

.mark {
  align-items: center;
  border-radius: 999px;
  display: flex;
  flex: none;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  height: 18px;
  justify-content: center;
  margin-top: 2px;
  width: 18px;
}

.mark[data-who="you"] {
  background: var(--warning-soft);
  color: var(--warning);
}

.mark[data-who="claude"] {
  background: var(--primary-soft);
  color: var(--primary-deep);
}

.text {
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  color: var(--ink);
  display: -webkit-box;
  font-size: 13px;
  line-height: 1.5;
  min-width: 0;
  overflow: hidden;
  white-space: pre-line;
}

.text[data-reply] {
  color: var(--muted);
}

.receipts {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-left: 26px;
}

.chip {
  background: var(--sunken);
  border-radius: 999px;
  padding: 3px 8px;
  text-transform: none;
}

.chip[data-kind="wrote"] {
  background: var(--success-soft);
  color: var(--success);
}

.chip[data-kind="failed"] {
  background: var(--error-soft);
  color: var(--error);
}

.chip[data-kind="spawned"] {
  background: var(--primary-soft);
  color: var(--primary-deep);
}

/* A turn that changed nothing is a real turn, so it says so rather than showing nothing. */
.chip[data-kind="none"] {
  background: transparent;
  color: var(--subtle);
  padding-left: 0;
}
</style>
