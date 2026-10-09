<script lang="ts" setup>
import { Send } from "@lucide/vue";

type Delivery = { delivered: true } | { delivered: false; reason: "no-live-session" | "refused-by-inbox" };

const sc = useSidecar();
const tray = useTray();
const chrome = useChrome();
const sending = ref(false);

const FAILED: Record<Exclude<Delivery, { delivered: true }>["reason"], string> = {
  "no-live-session": "This conversation isn't running, so the notes stay in the tray.",
  "refused-by-inbox": "The conversation refused the notes. They stay in the tray, try again in a moment.",
};

// Claude Code is the chat, so the sidecar only hands over what was left on a page or a line.
async function send(): Promise<void> {
  const key = sc.sessionKey.value;
  const handover = tray.handOver("");
  if (!key || !handover.text || sending.value) return;
  sending.value = true;
  try {
    const reply = await $fetch<Delivery>(`/api/sessions/${encodeURIComponent(key)}/message`, {
      body: { text: handover.text },
      method: "POST",
    });
    if (reply.delivered) {
      handover.settle();
      chrome.toast("Sent to Claude", "success");
    } else chrome.toast(FAILED[reply.reason], "warning");
  } catch {
    chrome.toast("The sidecar could not reach its server.", "destructive");
  } finally {
    sending.value = false;
  }
}

onMounted(() => {
  // The chips are deliberately not persisted, so a refresh would drop typed words with no receipt.
  function warn(event: BeforeUnloadEvent): void {
    if (tray.count.value) event.preventDefault();
  }
  window.addEventListener("beforeunload", warn);
  onScopeDispose(() => window.removeEventListener("beforeunload", warn));
});
</script>

<template>
  <div v-if="tray.count.value" class="notes" data-region="composer-notes">
    <ComposerTray />
    <UiSurface class="pill" pad="none" shape="pill" variant="glass-liquid">
      <button v-press class="send focusable" type="button" :disabled="sending" @click="send">
        <UiIcon :icon="Send" size="sm" />
        {{ sending ? "Sending…" : `Send ${plural(tray.count.value, "note")} to Claude` }}
      </button>
    </UiSurface>
  </div>
</template>

<style scoped>
.notes {
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pill {
  align-items: center;
  display: flex;
  height: var(--island-row-h);
  overflow: hidden;
}

.send {
  align-items: center;
  background: var(--primary);
  border: 0;
  border-radius: inherit;
  color: var(--primary-content);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  gap: 8px;
  height: 100%;
  padding: 0 16px;
}

.send:disabled {
  cursor: progress;
  opacity: 0.7;
}
</style>
