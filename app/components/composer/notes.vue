<script lang="ts" setup>
import { Send } from "@lucide/vue";
import type { AskClaudeTurn } from "~/utils/ask-claude";

type Delivery = { delivered: true } | { delivered: false; reason: "no-live-session" | "refused-by-inbox" };

const sc = useSidecar();
const tray = useTray();
const chrome = useChrome();
const askClaude = $askClaude();
const sending = ref(false);
const isAsking = ref(false);
const island = useTemplateRef<{ focus: () => void }>("island");

const FAILED: Record<Exclude<Delivery, { delivered: true }>["reason"], string> = {
  "no-live-session": "This conversation isn't running, so the notes stay in the tray.",
  "refused-by-inbox": "The conversation refused the notes. They stay in the tray, try again in a moment.",
};

async function deliver(text: string): Promise<Delivery | undefined> {
  const key = sc.sessionKey.value;
  if (!key || !text || sending.value) return undefined;
  sending.value = true;
  try {
    return await $fetch<Delivery>(`/api/sessions/${encodeURIComponent(key)}/message`, {
      body: { text },
      method: "POST",
    });
  } catch {
    chrome.toast("The sidecar could not reach its server.", "destructive");
    return undefined;
  } finally {
    sending.value = false;
  }
}

// Claude Code is the chat, so the sidecar only hands over what was left on a page or a line.
async function send(): Promise<void> {
  const handover = tray.handOver("");
  const reply = await deliver(handover.text);
  if (!reply) return;
  if (!reply.delivered) return chrome.toast(FAILED[reply.reason], "warning");
  handover.settle();
  chrome.toast("Sent to Claude", "success");
}

// The sidecar's version of the f key in /btw: the side exchange becomes a real turn.
async function sendAnswer(turn: AskClaudeTurn): Promise<void> {
  const key = sc.sessionKey.value;
  if (!key || !turn.answer) return;
  const reply = await deliver(`I asked you on the side: ${turn.question}\nYou answered: ${turn.answer}`);
  if (!reply) return;
  if (!reply.delivered) return chrome.toast("The conversation did not take it, try again in a moment.", "warning");
  askClaude.markSent(key, turn.id);
  chrome.toast("Sent to Claude as your next message", "success");
}

// A note box saves on its own Enter and prevents it, so only a ⌘↵ or ⌥↵ nobody handled lands here.
function onKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey) {
    event.preventDefault();
    void send();
    return;
  }
  if (!event.altKey) return;
  event.preventDefault();
  if (isAsking.value) island.value?.focus();
  else isAsking.value = true;
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  onScopeDispose(() => window.removeEventListener("keydown", onKey));
  // The chips are deliberately not persisted, so a refresh would drop typed words with no receipt.
  function warn(event: BeforeUnloadEvent): void {
    if (tray.count.value) event.preventDefault();
  }
  window.addEventListener("beforeunload", warn);
  onScopeDispose(() => window.removeEventListener("beforeunload", warn));
});
</script>

<template>
  <div v-if="sc.sessionKey.value" class="notes" data-region="composer-notes">
    <ComposerTray />
    <div class="pills">
      <ComposerAskClaude ref="island" v-model:open="isAsking" @send="sendAnswer" />
      <UiSurface v-if="tray.count.value" class="pill" pad="none" shape="pill" variant="glass-liquid">
        <button
          v-press
          class="send focusable"
          type="button"
          data-tip="Send to Claude · {cmd enter}"
          :disabled="sending"
          @click="send"
        >
          <UiIcon :icon="Send" size="sm" />
          {{ sending ? "Sending…" : `Send ${plural(tray.count.value, "note")} to Claude` }}
        </button>
      </UiSurface>
    </div>
  </div>
</template>

<style scoped>
.notes {
  @apply flex flex-col items-end gap-2;
}

/* Full width, so the island's percentage width resolves against the dock rather than its own content. */
.pills {
  @apply flex w-full items-end justify-end gap-2;
}

.pill {
  @apply flex h-(--island-row-h) items-center overflow-hidden;
}

.send {
  @apply inline-flex h-full cursor-pointer items-center gap-2 rounded-[inherit] border-0 bg-primary px-4 py-0 text-[12.5px] font-semibold text-primary-content;
}

.send:disabled {
  @apply cursor-progress opacity-70;
}
</style>
