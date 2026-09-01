<script setup lang="ts">
import { displayStepName, stepPosition, stepState } from "~/composables/pipeline"

const { data: why } = useWhy()
const { data: contracts } = useContracts()

const pipeline = computed(() => why.value?.pipeline)

// Why's own Pipeline carries no loop info; joined from the active mode contract's front matter.
const loopEdge = computed<{ from: number; to: number } | undefined>(() => {
  const modeName = why.value?.slots.mode.name
  const steps = pipeline.value?.steps
  const edges = contracts.value?.modes.find((c) => c.name === modeName)?.loops
  if (!steps || !edges) return undefined
  for (const edge of edges) {
    const from = steps.indexOf(edge.from)
    const to = steps.indexOf(edge.to)
    if (from > 0 && to >= 0) return { from, to }
  }
  return undefined
})

const loopPath = computed<string | undefined>(() => {
  const steps = pipeline.value?.steps
  if (!loopEdge.value || !steps) return undefined
  const from = stepPosition(loopEdge.value.from, steps.length)
  const to = stepPosition(loopEdge.value.to, steps.length)
  return `M ${from} 1 C ${from} 13, ${to} 13, ${to} 1`
})

const readout = computed<string | undefined>(() => {
  if (!pipeline.value) return undefined
  if (pipeline.value.complete) return "complete"
  if (!pipeline.value.current) return undefined
  return `step ${pipeline.value.done.length + 1} of ${pipeline.value.steps.length}`
})
</script>

<template>
  <UiSurface
    v-if="pipeline"
    v-island-pop
    variant="glass-liquid"
    shape="island"
    class="pipeline-island"
    :style="{ '--glass-refraction-band': 12, '--glass-refraction-scale': -34 }"
    role="group"
    aria-label="Pipeline position"
  >
    <div class="rule">
      <svg
        v-if="loopPath"
        class="loop"
        viewBox="0 0 100 15"
        preserveAspectRatio="none"
        role="img"
        aria-label="A later step loops back to the first step"
      >
        <path class="loopline" :d="loopPath" vector-effect="non-scaling-stroke" />
      </svg>
      <span
        v-for="(step, i) in pipeline.steps"
        :key="step"
        class="step"
        :data-state="stepState(pipeline, step)"
        :style="{ '--pos': stepPosition(i, pipeline.steps.length) + '%' }"
      >
        <span class="dot"></span>
        <span class="lab">{{ displayStepName(step) }}</span>
      </span>
    </div>
    <div v-if="readout" class="readout">
      {{ readout }}
      <b v-if="pipeline.current">{{ displayStepName(pipeline.current) }}</b>
    </div>
  </UiSurface>
</template>

<style scoped>
.pipeline-island {
  position: fixed;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.625rem 1.375rem;
  border-radius: var(--radius-selector);
}

.rule {
  position: relative;
  min-width: 280px;
  height: 34px;
}

.loop {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 12px;
  width: 100%;
}

.loopline {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.step {
  position: absolute;
  top: 0;
  left: var(--pos);
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--border-strong);
}

.lab {
  font-family: var(--mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--subtle);
  white-space: nowrap;
}

.step[data-state="done"] .dot {
  background: var(--success);
}

.step[data-state="done"] .lab {
  color: var(--muted);
}

.step[data-state="now"] .dot {
  background: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
}

.step[data-state="now"] .lab {
  color: var(--primary-deep);
  font-weight: 500;
}

.readout {
  flex: none;
  align-self: center;
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  color: var(--subtle);
  white-space: nowrap;
}

.readout b {
  margin-left: 0.375rem;
  color: var(--primary-deep);
  font-weight: 500;
}

@media (max-width: 860px) {
  .pipeline-island {
    display: none;
  }
}
</style>
