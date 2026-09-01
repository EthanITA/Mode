<script lang="ts" setup>
const { phase = "not real", why } = defineProps<{
  phase?: string;
  why: string;
}>();
</script>

<template>
  <span class="mark mono-meta" :title="why">
    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.2 11 10.5H1z" /></svg>
    {{ phase }}
  </span>
</template>

<style scoped>
.mark {
  align-items: center;
  background: var(--warning-soft);
  border-radius: 999px;
  color: var(--warning);
  cursor: help;
  display: inline-flex;
  flex: none;
  gap: 4px;
  padding: 2px 7px;
}

.mark svg {
  fill: none;
  height: 9px;
  stroke: currentColor;
  stroke-linejoin: round;
  stroke-width: 1.6;
  width: 9px;
}
</style>
