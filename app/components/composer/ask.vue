<script lang="ts" setup>
import type { Ask } from "~/composables/useConversation";

const { ask } = defineProps<{ ask: Ask[] }>();
const emit = defineEmits<{ pick: [text: string] }>();

// One answer per question, so a multi-select keeps a set and a single one replaces.
const held = reactive(new Map<number, Set<string>>());

function chosen(index: number, label: string): boolean {
  return Boolean(held.get(index)?.has(label));
}

function toggle(index: number, label: string): void {
  const multi = ask[index]?.multi;
  const set = held.get(index) ?? new Set<string>();
  if (set.has(label)) set.delete(label);
  else {
    if (!multi) set.clear();
    set.add(label);
  }
  held.set(index, set);
}

const ready = computed(() => ask.every((_, index) => held.get(index)?.size));

// The harness owns the pending call, so the pick travels back as an ordinary message.
function answer(): void {
  const lines = ask.map((one, index) => {
    const picked = [...(held.get(index) ?? [])].join(", ");
    return ask.length > 1 ? `${one.header || one.question}: ${picked}` : picked;
  });
  emit("pick", lines.join("\n"));
}
</script>

<template>
  <div class="ask" data-region="ask">
    <section v-for="(one, index) in ask" :key="index" class="q">
      <p class="head mono-meta">{{ one.header || "Question" }}</p>
      <p class="question">{{ one.question }}</p>

      <div class="options">
        <button
          v-for="option in one.options"
          :key="option.label"
          v-press
          class="option focusable"
          type="button"
          :aria-pressed="chosen(index, option.label)"
          @click="toggle(index, option.label)"
        >
          <span class="label">{{ option.label }}</span>
          <span v-if="option.description" class="why">{{ option.description }}</span>
        </button>
      </div>
    </section>

    <div class="foot">
      <span class="note mono-meta">the pick is sent as a message</span>
      <button v-press class="send focusable" type="button" :disabled="!ready" @click="answer">Answer</button>
    </div>
  </div>
</template>

<style scoped>
.ask {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  margin-block-start: var(--s3);
}

.q {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
}

.head {
  color: var(--muted);
}

.question {
  color: var(--ink);
  margin: 0;
}

.options {
  display: flex;
  flex-direction: column;
  gap: var(--s1);
}

.option {
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-field);
  color: var(--ink);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  font-family: var(--sans);
  gap: 2px;
  padding: var(--s2);
  text-align: start;
}

.option[aria-pressed="true"] {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--canvas);
}

.label {
  font-size: 13px;
  font-weight: 600;
}

.why {
  font-size: 12px;
  opacity: 0.8;
}

.foot {
  align-items: center;
  display: flex;
  gap: var(--s2);
  justify-content: space-between;
}

.note {
  color: var(--muted);
}

.send {
  background: var(--ink);
  border: 0;
  border-radius: 999px;
  color: var(--canvas);
  cursor: pointer;
  flex: none;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 600;
  height: 30px;
  padding: 0 12px;
}

.send:disabled {
  cursor: default;
  opacity: 0.5;
}
</style>
