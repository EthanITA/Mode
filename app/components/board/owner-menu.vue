<script lang="ts" setup>
import type { SessionAgent } from "~~/shared/types/session";

const { agents } = defineProps<{ agents: SessionAgent[] }>();
const emit = defineEmits<{ pick: [owner: string] }>();

function choose(owner: string, close: () => void): void {
  emit("pick", owner);
  close();
}
</script>

<template>
  <UiPopover placement="top" width="w-40" :estimated-height="agents.length * 34 + 76">
    <template #trigger>
      <slot />
    </template>
    <template #default="{ close }">
      <div class="menu">
        <!-- Stored as "user" because the board note to Claude would read "You" as Claude itself. -->
        <UiMenuItem @click="choose('user', close)">You</UiMenuItem>
        <UiMenuItem @click="choose('Claude', close)">Claude</UiMenuItem>
        <UiMenuItem v-for="agent in agents" :key="agent.name" @click="choose(agent.name, close)">
          {{ agent.name }}
        </UiMenuItem>
      </div>
    </template>
  </UiPopover>
</template>

<style scoped>
.menu {
  @apply flex min-w-35 flex-col gap-0.5 p-1.5;
}
</style>
