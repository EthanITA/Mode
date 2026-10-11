<script lang="ts" setup>
export type ListeningState = "listening" | "reconnecting";

const { state = "listening" } = defineProps<{ state?: ListeningState }>();
</script>

<template>
  <div class="tag" data-region="listening-tag" :data-state="state">
    <span class="dot" />
    <span class="label mono-meta">
      {{ state === "listening" ? "Listening · opens what Claude Code focuses" : "Not listening · server unreachable" }}
    </span>
  </div>
</template>

<style scoped>
.tag {
  align-items: center;
  display: flex;
  gap: 8px;
}

.dot {
  @apply breathe;
  --dot-size: 10px;
  background: var(--success);
}

.label {
  color: var(--subtle);
  white-space: nowrap;
}

.tag[data-state="reconnecting"] .dot {
  background: var(--warning);
}

.tag[data-state="reconnecting"] .label {
  color: var(--warning);
}
</style>
