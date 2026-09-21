<script lang="ts" setup>
import type { DeskBox } from "~/composables/useDesk";

const { boxes } = defineProps<{ boxes: DeskBox[] }>();

const PAD = 2;

// One viewBox around whatever the plane holds, so a thumbnail reads the same at any card width.
const view = computed(() => {
  if (!boxes.length) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return `${left - PAD} ${top - PAD} ${right - left + PAD * 2} ${bottom - top + PAD * 2}`;
});
</script>

<template>
  <svg v-if="view" aria-hidden="true" class="preview" preserveAspectRatio="xMidYMid meet" :viewBox="view">
    <rect
      v-for="(box, index) in boxes"
      :key="index"
      :data-note="box.note"
      :height="box.h"
      rx="10"
      :width="box.w"
      :x="box.x"
      :y="box.y"
    />
  </svg>
</template>

<style scoped>
.preview {
  display: block;
  height: 62px;
  width: 100%;
}

.preview rect {
  fill: var(--sunken);
  stroke: var(--border);
  stroke-width: 2;
}

.preview rect[data-note="true"] {
  fill: var(--warning-soft);
  stroke: var(--warning);
}
</style>
