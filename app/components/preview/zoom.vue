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
  @apply inline-flex h-6.5 flex-none items-center rounded-full border border-[color:var(--action-line,var(--border-strong))] px-px py-0 text-[color:var(--action-ink,var(--ink))];
}

.step,
.level {
  @apply h-5.5 cursor-pointer rounded-full border-0 bg-transparent text-inherit transition-[background-color] duration-(--duration-press) ease-[ease];
}

.step {
  @apply grid w-5.5 place-items-center p-0;
}

.level {
  @apply min-w-11 px-1 py-0 font-mono typo-meta-semibold tabular-nums;
}

@media (hover: hover) and (pointer: fine) {
  .step:hover:not(:disabled),
  .level:hover {
    @apply bg-[color:var(--action-line,var(--border-strong))];
  }
}

.step:disabled {
  @apply cursor-default opacity-40;
}
</style>
