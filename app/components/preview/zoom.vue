<script lang="ts" setup>
import { Minus, Plus } from "@lucide/vue";

const zoom = defineModel<number>({ required: true });
</script>

<template>
  <span class="zoom" data-region="preview-zoom" role="group" aria-label="Zoom">
    <UiIconButton
      aria-label="Zoom out"
      data-tip="Zoom out · pinch zooms too"
      :disabled="Preview.step(zoom, -1) === zoom"
      :icon="Minus"
      icon-size="xs"
      size="xs"
      @click="zoom = Preview.step(zoom, -1)"
    />
    <UiButton class="level" data-tip="Back to fit" size="xs" variant="ghost" @click="zoom = 1">
      {{ Math.round(zoom * 100) }}%
    </UiButton>
    <UiIconButton
      aria-label="Zoom in"
      data-tip="Zoom in · pinch zooms too"
      :disabled="Preview.step(zoom, 1) === zoom"
      :icon="Plus"
      icon-size="xs"
      size="xs"
      @click="zoom = Preview.step(zoom, 1)"
    />
  </span>
</template>

<style scoped>
.zoom {
  @apply decision-pill flex-none;
}

.level {
  @apply h-5 min-w-11 px-1 font-mono tabular-nums;
}
</style>
