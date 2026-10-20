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
  @apply flex items-center gap-2;
}

.dot {
  @apply breathe size-2.5 bg-success;
}

.label {
  @apply whitespace-nowrap text-subtle;
}

.tag[data-state="reconnecting"] .dot {
  @apply bg-warning;
}

.tag[data-state="reconnecting"] .label {
  @apply text-warning;
}
</style>
