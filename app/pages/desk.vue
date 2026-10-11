<script lang="ts" setup>
import { ArrowLeft } from "@lucide/vue";
import type { DeskRow } from "~/composables/useDesk";

const sc = useSidecar();
const chrome = useChrome();
const router = useRouter();

loadSidecar();

function open(key: string): void {
  sc.sessionKey.value = key;
  navigateTo(`/c/${key}`);
}

// A desk opened cold has nothing behind it, so Back lands on Listening instead of leaving the app.
function back(): void {
  if (window.history.state?.back) router.back();
  else void navigateTo("/", { replace: true });
}

async function remove(row: DeskRow): Promise<void> {
  try {
    await $fetch(`/api/sessions/${row.key}`, { method: "DELETE" });
    // Drop it here rather than waiting for the poll, so the row does not linger for five seconds.
    sc.sessions.value = sc.sessions.value.filter((session) => session.key !== row.key);
    chrome.toast(`Deleted ${row.title}. Its transcript stays on disk.`, "success");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    chrome.toast(`Could not delete ${row.title}. ${reason}`, "destructive");
  }
}
</script>

<template>
  <NuxtLayout>
    <template #lead>
      <ChromeAction data-region="desk-back" :icon="ArrowLeft" shape="island" tip="Back · esc" @click="back" />
    </template>

    <DeskTriage @back="back" @open="open" @remove="remove" />
  </NuxtLayout>
</template>
