<script lang="ts" setup>
const { waiting } = useScreen();

const headline = computed(() =>
  waiting.value.total ? `${waiting.value.total} waiting for you` : "nothing waiting for you",
);
</script>

<template>
  <UiSurface v-island-pop="'top right'" class="awaiting" data-region="awaiting-island" variant="glass" shape="island">
    <span class="head" :data-any="waiting.total ? '' : undefined">
      <span class="dot" />
      {{ headline }}
    </span>

    <span class="rule" />

    <span class="breakdown mono-meta">
      <span data-scaffold>
        <span class="scaffold-body">{{ plural(waiting.questions, "question") }}</span>
        <UiScaffoldMark phase="phase 4" why="Questions arrive with the streaming CLI, so this arm is always zero today." />
      </span>
      <span class="sep">·</span>
      <span>{{ plural(waiting.gates, "gate") }}</span>
      <span class="sep">·</span>
      <span>{{ plural(waiting.notes, "note") }}</span>
    </span>

    <span class="rule" />

    <UiThemeToggle />
    <button
      class="share focusable plain-button"
      type="button"
      disabled
      title="Read only: the sidecar does not publish"
      aria-label="Share (unavailable: the sidecar is read only)"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 10.5V2.5M5 5.3 8 2.3l3 3M3.5 9.5v3a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3" />
      </svg>
    </button>
  </UiSurface>
</template>

<style scoped>
.awaiting {
  align-items: center;
  display: flex;
  gap: 10px;
  padding: 7px 10px 7px 14px;
}

.head {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 13px;
  gap: 7px;
  white-space: nowrap;
}

.head .dot {
  background: var(--subtle);
}

.head[data-any] {
  color: var(--ink);
  font-weight: 600;
}

.head[data-any] .dot {
  background: var(--warning);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--warning) 22%, transparent);
}

.rule {
  background: var(--border-strong);
  flex: none;
  height: 14px;
  width: 1px;
}

.breakdown {
  align-items: center;
  color: var(--subtle);
  display: flex;
  gap: 5px;
  white-space: nowrap;
}

.breakdown > span[data-scaffold] {
  align-items: center;
  display: inline-flex;
  gap: 5px;
}

.sep {
  opacity: 0.6;
}

.awaiting :deep(.theme-toggle) {
  height: 28px;
  position: static;
  width: 28px;
}

.share {
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--subtle);
  display: flex;
  height: 28px;
  justify-content: center;
  opacity: 0.5;
  width: 28px;
}

.share svg {
  fill: none;
  height: 14px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  width: 14px;
}
</style>
