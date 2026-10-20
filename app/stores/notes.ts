type Delivery = { delivered: true } | { delivered: false; reason: "no-live-session" | "refused-by-inbox" };

const FAILED: Record<Exclude<Delivery, { delivered: true }>["reason"], string> = {
  "no-live-session": "This conversation isn't running, so the notes stay in the tray.",
  "refused-by-inbox": "The conversation refused the notes. They stay in the tray, try again in a moment.",
};

// One sender for the dock and the grown sheet, so a press in one cannot ride while the other's is in flight.
export const $notes = defineStore(() => {
  const sc = useSidecar();
  const tray = useTray();
  const chrome = useChrome();
  const isSending = ref(false);

  async function deliver(text: string): Promise<Delivery | undefined> {
    const key = sc.sessionKey.value;
    if (!key || !text || isSending.value) return undefined;
    isSending.value = true;
    try {
      return await $fetch<Delivery>(`/api/sessions/${encodeURIComponent(key)}/message`, {
        body: { text },
        method: "POST",
      });
    } catch {
      chrome.toast("The sidecar could not reach its server.", "destructive");
      return undefined;
    } finally {
      isSending.value = false;
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

  return { deliver, isSending, send };
});
