<script lang="ts" setup>
import type { DeskCard } from "~/composables/useDesk";

const sc = useSidecar();
const chrome = useChrome();

loadSidecar();

function open(key: string): void {
  sc.sessionKey.value = key;
  navigateTo(`/c/${key}`);
}

async function remove(card: DeskCard): Promise<void> {
  try {
    await $fetch(`/api/sessions/${card.key}`, { method: "DELETE" });
    // Drop it here rather than waiting for the poll, so the card does not linger for five seconds.
    sc.sessions.value = sc.sessions.value.filter((session) => session.key !== card.key);
    chrome.toast(`Deleted ${card.title}. Its transcript stays on disk.`, "success");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    chrome.toast(`Could not delete ${card.title}. ${reason}`, "destructive");
  }
}
</script>

<template>
  <NuxtLayout>
    <template #lead>
      <DeskHead />
    </template>

    <DeskGrid @open="open" @remove="remove" />
  </NuxtLayout>
</template>
