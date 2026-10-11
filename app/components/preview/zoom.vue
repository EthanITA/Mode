<script lang="ts" setup>
import { Minus, Plus } from "@lucide/vue";

const zoom = defineModel<number>({ required: true });
</script>

<template>
  <span class="zoom" data-region="preview-zoom" role="group" aria-label="Zoom">
    <button
      v-press
      class="step focusable"
      type="button"
      aria-label="Zoom out"
      data-tip="Zoom out · pinch zooms too"
      :disabled="Preview.step(zoom, -1) === zoom"
      @click="zoom = Preview.step(zoom, -1)"
    >
      <UiIcon :icon="Minus" size="xs" />
    </button>
    <button v-press class="level focusable" type="button" data-tip="Back to fit" @click="zoom = 1">
      {{ Math.round(zoom * 100) }}%
    </button>
    <button
      v-press
      class="step focusable"
      type="button"
      aria-label="Zoom in"
      data-tip="Zoom in · pinch zooms too"
      :disabled="Preview.step(zoom, 1) === zoom"
      @click="zoom = Preview.step(zoom, 1)"
    >
      <UiIcon :icon="Plus" size="xs" />
    </button>
  </span>
</template>

<style scoped>
/* Retinted through the same two variables as an action pill, so it sits on the dark editor bar too. */
.zoom {
  align-items: center;
  border: 1px solid var(--action-line, var(--border-strong));
  border-radius: 999px;
  color: var(--action-ink, var(--ink));
  display: inline-flex;
  flex: none;
  height: 26px;
  padding: 0 1px;
}

.step,
.level {
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  height: 22px;
  transition: background-color var(--duration-press) ease;
}

.step {
  display: grid;
  padding: 0;
  place-items: center;
  width: 22px;
}

.level {
  font-family: var(--mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 44px;
  padding: 0 4px;
}

@media (hover: hover) and (pointer: fine) {
  .step:hover:not(:disabled),
  .level:hover {
    background: var(--action-line, var(--border-strong));
  }
}

.step:disabled {
  cursor: default;
  opacity: 0.4;
}
</style>
