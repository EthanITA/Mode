<script lang="ts" setup>
import type { Turn } from "~/utils/turns";

const { turn, hasAgents = false } = defineProps<{ turn: Turn; hasAgents?: boolean }>();

const hasChurn = computed(() => turn.files.some((one) => !!one.churn));
</script>

<template>
  <span class="meta mono-meta">
    <template v-if="turn.state === 'running'">
      <span class="pulse dot" aria-hidden="true" />
      <span data-tone="live">running</span>
    </template>
    <span v-else-if="turn.state === 'waiting'" data-tone="waiting">waiting on you</span>
    <template v-if="turn.files.length">
      <template v-if="hasChurn">
        <span data-tone="add">+{{ turn.added }}</span>
        <span data-tone="remove">−{{ turn.removed }}</span>
      </template>
      <span>{{ hasChurn ? "· " : "" }}{{ plural(turn.files.length, "file") }}</span>
    </template>
    <span v-else-if="turn.state === 'done'">no changes</span>
    <template v-if="hasAgents">
      <span v-for="agent in turn.agents" :key="agent" class="agent">{{ authorOf(agent) }}</span>
    </template>
  </span>
</template>

<style scoped>
.meta {
  @apply flex flex-wrap items-center gap-1.5 text-subtle normal-case;
}

.pulse {
  @apply breathe bg-primary;
  --dot-size: 6px;
}

[data-tone="live"] {
  @apply text-primary;
}

[data-tone="waiting"] {
  @apply text-warning;
}

[data-tone="add"] {
  @apply text-success;
}

[data-tone="remove"] {
  @apply text-error;
}

.agent {
  @apply rounded-full bg-primary-soft px-1.75 py-px text-primary-deep;
}
</style>
