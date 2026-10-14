<script lang="ts" setup>
import type { Turn } from "~/utils/turns";

const { turn, hasAgents = false } = defineProps<{ turn: Turn; hasAgents?: boolean }>();

const hasChurn = computed(() => turn.files.some((one) => !!one.churn));
</script>

<template>
  <span class="meta mono-meta">
    <template v-if="turn.state === 'running'">
      <span class="dot pulse" aria-hidden="true" />
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
  align-items: center;
  color: var(--subtle);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  text-transform: none;
}

.pulse {
  @apply breathe;
  --dot-size: 6px;
  background: var(--primary);
}

[data-tone="live"] {
  color: var(--primary);
}

[data-tone="waiting"] {
  color: var(--warning);
}

[data-tone="add"] {
  color: var(--success);
}

[data-tone="remove"] {
  color: var(--error);
}

.agent {
  background: var(--primary-soft);
  border-radius: 999px;
  color: var(--primary-deep);
  padding: 1px 7px;
}
</style>
