<script lang="ts" setup>
import type { Contract } from "~~/shared/types/mode";

const { contract, current } = defineProps<{ contract: Contract; current?: string }>();

const ROW = 40;

const height = computed(() => contract.steps.length * ROW);

const cursor = computed(() =>
  current ? contract.steps.findIndex((step) => step.label.toLowerCase() === current.toLowerCase()) : -1,
);

function stateAt(index: number): "ahead" | "current" | "done" {
  if (cursor.value < 0) return "ahead";
  if (index < cursor.value) return "done";
  return index === cursor.value ? "current" : "ahead";
}

const forward = computed(() =>
  contract.steps.slice(1).map((_, gap) => {
    const from = gap * ROW + 33;
    const to = (gap + 1) * ROW + 7;
    return `M17 ${from}V${to}M14 ${to - 4}l3 4 3-4`;
  }),
);

// A loop naming a step the contract no longer lists drops its arc, never the whole drawing.
const back = computed(() => {
  const at = (label: string) => contract.steps.findIndex((step) => step.label.toLowerCase() === label);
  return contract.loops.flatMap((loop) => {
    const from = at(loop.from);
    const to = at(loop.to);
    if (from < 0 || to < 0) return [];
    const y0 = from * ROW + 20;
    const y1 = to * ROW + 20;
    return [`M13 ${y0}C1 ${y0},1 ${y1},13 ${y1}M10 ${y1 - 3}l3 3-3 3`];
  });
});

const gates = computed(() => contract.steps.filter((step) => step.gate).map((step) => step.label));
</script>

<template>
  <div class="diagram" :data-tint="tintOf(contract.color, `${contract.axis}:${contract.name}`)">
    <div class="head">
      <span class="dot" />
      <span class="name">{{ contract.name }}</span>
      <span class="count mono-meta">{{ plural(contract.steps.length, "step") }}</span>
    </div>

    <p class="summary">{{ contract.summary || `No summary is written for ${contract.name}.` }}</p>

    <div v-if="contract.steps.length" class="plot">
      <svg class="edges" :viewBox="`0 0 34 ${height}`" :style="{ height: `${height}px` }" aria-hidden="true">
        <path v-for="(d, index) in forward" :key="`f${index}`" class="fwd" :d="d" />
        <path v-for="(d, index) in back" :key="`b${index}`" class="loop" :d="d" />
      </svg>

      <ol class="steps">
        <li v-for="(step, index) in contract.steps" :key="step.label" class="row">
          <span class="step" :data-state="stateAt(index)" :data-gate="step.gate">
            <i class="mark" />
            <span class="label">{{ step.label }}</span>
            <span v-if="step.gate" class="gate mono-meta">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 9-9 9-9-9z" /></svg>
              gate
            </span>
            <span v-if="stateAt(index) !== 'ahead'" class="tag mono-meta">
              {{ stateAt(index) === "done" ? "done" : "now" }}
            </span>
          </span>
        </li>
      </ol>
    </div>

    <p v-else class="none mono-meta">no pipeline · this contract shapes the voice, not the steps</p>

    <div v-if="contract.steps.length" class="legend mono-meta">
      <span class="key"
        ><i class="dash" />{{
          back.length ? `${contract.loops[0]?.from} → ${contract.loops[0]?.to}` : "one way through"
        }}</span
      >
      <span class="gates">{{ gates.length ? `gate · ${gates.join(" · ")}` : "no gate" }}</span>
    </div>
  </div>
</template>

<style scoped>
.diagram {
  @apply flex flex-col gap-2 text-left;
}

.head {
  @apply flex items-center gap-1.75;
}

.dot {
  @apply size-2 flex-none rounded-full bg-tint;
}

.name {
  @apply typo-caption-strong;
}

.count {
  @apply ml-auto text-muted;
}

.summary {
  @apply m-0 typo-caption leading-normal text-muted;
}

.plot {
  @apply relative;
}

.edges {
  @apply absolute top-0 left-0 w-8.5 overflow-visible fill-none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.fwd {
  @apply stroke-border-strong;
  stroke-width: 1.5;
}

.loop {
  @apply stroke-warning;
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
}

.steps {
  @apply m-0 list-none p-0;
}

.row {
  @apply flex h-10 items-center pl-8.5;
}

.step {
  @apply flex h-6.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent px-2.25 py-0;
}

.step[data-gate="true"] {
  @apply rounded-sm border-warning;
}

.step[data-state="current"] {
  @apply border-border-strong bg-sunken;
}

.mark {
  @apply block h-0.75 w-3 flex-none rounded-xs bg-border-strong;
}

.step[data-state="done"] .mark {
  @apply bg-fg;
}

.step[data-state="current"] .mark {
  @apply bg-tint;
}

.label {
  @apply min-w-0 flex-1 truncate typo-caption-medium text-subtle;
}

.step[data-state="done"] .label {
  @apply text-muted;
}

.step[data-state="current"] .label {
  @apply font-semibold text-fg;
}

.gate {
  @apply inline-flex flex-none items-center gap-1 text-warning;
}

.gate svg {
  @apply size-2.5 fill-none stroke-current;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tag {
  @apply flex-none text-muted;
}

.step[data-state="done"] .tag {
  @apply text-success;
}

.none {
  @apply m-0 text-subtle;
}

.legend {
  @apply flex items-center gap-3 pt-0.5 text-muted;
}

.key {
  @apply inline-flex items-center gap-1.25;
}

.dash {
  @apply block h-0 w-3.5 border-t-2 border-dashed border-warning;
}

.gates {
  @apply ml-auto truncate text-subtle;
}
</style>
