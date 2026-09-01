<script lang="ts" setup>
const { withSlots = false } = defineProps<{ withSlots?: boolean }>();

const { liveState, steps } = useScreen();
</script>

<template>
  <UiSurface v-island-pop class="island" data-region="pipeline-island" variant="glass-liquid" shape="island">
    <PipelineSlotChips v-if="withSlots" />
    <span v-if="withSlots && steps.length" class="rule" />

    <ol v-if="steps.length" class="steps">
      <li v-for="step in steps" :key="step.label" class="step mono-meta" :data-state="step.state">
        <span v-if="step.state === 'current'" class="dot" />
        {{ step.label }}<span v-if="step.gate" class="gate" title="This step waits on a decision">?</span>
      </li>
    </ol>
    <span v-else class="none mono-meta">no pipeline · the mode slot holds no contract</span>

    <span class="rule" />

    <span class="live mono-meta" :data-live="liveState.running ? '' : undefined">
      <span class="dot" />
      {{ liveState.label }}
    </span>
    <UiScaffoldMark
      phase="phase 3"
      why="Working and idle come from the session registry. Finer states — thinking, writing v4 — need the transcript tail, which phase 3 adds."
    />

    <button
      class="send focusable"
      type="button"
      disabled
      title="Phase 4: the sidecar cannot send into a conversation yet"
      aria-label="Send (unavailable until phase 4)"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.5V3.5M4 7.2 8 3.2l4 4" /></svg>
    </button>
  </UiSurface>
</template>

<style scoped>
.island {
  /* The island is short, so the default rim would eat the whole surface. */
  --glass-refraction-band: 12;
  --glass-refraction-scale: -34;

  align-items: center;
  display: flex;
  gap: 10px;
  max-width: 100%;
  overflow: hidden;
  padding: 8px 8px 8px 14px;
}

.rule {
  background: var(--border-strong);
  flex: none;
  height: 14px;
  width: 1px;
}

.steps {
  display: flex;
  gap: 10px;
  list-style: none;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  padding: 0;
}

.step {
  align-items: center;
  color: var(--subtle);
  display: flex;
  gap: 4px;
  white-space: nowrap;
}

.step[data-state="done"] {
  color: var(--muted);
}

.step[data-state="current"] {
  color: var(--ink);
  font-weight: 600;
}

.step[data-state="current"] .dot {
  --dot-size: 6px;

  background: var(--primary);
}

.gate {
  color: var(--warning);
  font-weight: 600;
}

.none {
  color: var(--subtle);
  white-space: nowrap;
}

.live {
  align-items: center;
  color: var(--subtle);
  display: flex;
  flex: none;
  gap: 5px;
}

.live .dot {
  --dot-size: 6px;

  background: var(--subtle);
}

.live[data-live] {
  color: var(--success);
}

.live[data-live] .dot {
  animation: breathe 2.4s var(--ease-in-out) infinite;
  background: var(--success);
}

@keyframes breathe {
  50% {
    opacity: 0.35;
  }
}

.send {
  align-items: center;
  background: var(--secondary);
  border: 0;
  border-radius: 999px;
  color: var(--canvas);
  cursor: not-allowed;
  display: flex;
  flex: none;
  height: 30px;
  justify-content: center;
  opacity: 0.45;
  width: 30px;
}

.send svg {
  fill: none;
  height: 15px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
  width: 15px;
}

@media (prefers-reduced-motion: reduce) {
  .live[data-live] .dot {
    animation: none;
  }
}
</style>
