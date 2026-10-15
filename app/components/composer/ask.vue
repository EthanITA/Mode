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
  @apply mt-(--s3) flex flex-col gap-(--s3);
}

.q {
  @apply flex flex-col gap-(--s1);
}

.head {
  @apply text-muted;
}

.question {
  @apply m-0 text-fg;
}

.options {
  @apply flex flex-col gap-(--s1);
}

.option {
  @apply flex cursor-pointer flex-col gap-0.5 rounded-field border border-border bg-sunken p-(--s2) text-start font-sans text-fg;
}

.option[aria-pressed="true"] {
  @apply border-fg bg-fg text-canvas;
}

.label {
  @apply typo-body-strong;
}

.why {
  @apply typo-caption opacity-80;
}

.foot {
  @apply flex items-center justify-between gap-(--s2);
}

.note {
  @apply text-muted;
}

.send {
  @apply h-7.5 flex-none cursor-pointer rounded-full border-0 bg-fg px-3 py-0 font-sans typo-caption-strong text-canvas;
}

.send:disabled {
  @apply cursor-default opacity-50;
}
</style>
