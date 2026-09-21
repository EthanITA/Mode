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
      <span class="key"><i class="dash" />{{ back.length ? `${contract.loops[0]?.from} → ${contract.loops[0]?.to}` : "one way through" }}</span>
      <span class="gates">{{ gates.length ? `gate · ${gates.join(" · ")}` : "no gate" }}</span>
    </div>
  </div>
</template>

<style scoped>
.diagram {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.head {
  align-items: center;
  display: flex;
  gap: 7px;
}

.dot {
  background: var(--tint);
  border-radius: 999px;
  flex: none;
  height: 8px;
  width: 8px;
}

.name {
  font-size: 12px;
  font-weight: 600;
}

.count {
  color: var(--muted);
  margin-left: auto;
}

.summary {
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.45;
  margin: 0;
}

.plot {
  position: relative;
}

.edges {
  fill: none;
  left: 0;
  overflow: visible;
  position: absolute;
  stroke-linecap: round;
  stroke-linejoin: round;
  top: 0;
  width: 34px;
}

.fwd {
  stroke: var(--border-strong);
  stroke-width: 1.5;
}

.loop {
  stroke: var(--warning);
  stroke-dasharray: 3 3;
  stroke-width: 1.5;
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  align-items: center;
  box-sizing: border-box;
  display: flex;
  height: 40px;
  padding-left: 34px;
}

.step {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  box-sizing: border-box;
  display: flex;
  flex: 1;
  gap: 8px;
  height: 26px;
  min-width: 0;
  padding: 0 9px;
}

.step[data-gate="true"] {
  border-color: var(--warning);
  border-radius: 4px;
}

.step[data-state="current"] {
  background: var(--sunken);
  border-color: var(--border-strong);
}

.mark {
  background: var(--border-strong);
  border-radius: 2px;
  display: block;
  flex: none;
  height: 3px;
  width: 12px;
}

.step[data-state="done"] .mark {
  background: var(--ink);
}

.step[data-state="current"] .mark {
  background: var(--tint);
}

.label {
  color: var(--subtle);
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step[data-state="done"] .label {
  color: var(--muted);
}

.step[data-state="current"] .label {
  color: var(--ink);
  font-weight: 600;
}

.gate {
  align-items: center;
  color: var(--warning);
  display: inline-flex;
  flex: none;
  gap: 4px;
}

.gate svg {
  fill: none;
  height: 10px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
  width: 10px;
}

.tag {
  color: var(--muted);
  flex: none;
}

.step[data-state="done"] .tag {
  color: var(--success);
}

.none {
  color: var(--subtle);
  margin: 0;
}

.legend {
  align-items: center;
  color: var(--muted);
  display: flex;
  gap: 12px;
  padding-top: 2px;
}

.key {
  align-items: center;
  display: inline-flex;
  gap: 5px;
}

.dash {
  border-top: 1.5px dashed var(--warning);
  display: block;
  height: 0;
  width: 14px;
}

.gates {
  color: var(--subtle);
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
