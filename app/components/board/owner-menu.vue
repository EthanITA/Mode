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
        <UiMenuItem @click="choose('Marco', close)">Marco</UiMenuItem>
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
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
  padding: 6px;
}
</style>
