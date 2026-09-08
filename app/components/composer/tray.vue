<script lang="ts" setup>
import { MessageSquare, X } from "@lucide/vue";
import type { FastModelReply, FastModelRequest } from "~~/shared/types/models";
import type { TrayItem } from "~/composables/useTray";

const tray = useTray();
const chrome = useChrome();
const chatting = ref<string>();
const draft = ref("");
const pending = ref(false);

const open = computed(() => tray.items.value.find((item) => item.id === chatting.value));

function failStatus(error: unknown): number {
  if (typeof error !== "object" || !error) return 0;
  const rec = error as { response?: { status?: unknown }; status?: unknown; statusCode?: unknown };
  if (typeof rec.statusCode === "number") return rec.statusCode;
  if (typeof rec.status === "number") return rec.status;
  if (typeof rec.response?.status === "number") return rec.response.status;
  return 0;
}

function toggleChat(item: TrayItem): void {
  if (item.kind !== "comment") return;
  chatting.value = chatting.value === item.id ? undefined : item.id;
  draft.value = "";
}

async function send(): Promise<void> {
  const item = open.value;
  const text = draft.value.trim();
  if (!item || !text || pending.value) return;
  pending.value = true;
  const history = item.chat || [];
  try {
    const body = {
      context: [item.quote, item.text].filter(Boolean).join("\n"),
      history,
      instruction: text,
      selection: item.quote || "",
      task: "chat",
    } satisfies FastModelRequest;
    const reply = await $fetch<FastModelReply>("/api/models/fast", { body, method: "POST" });
    const said = reply.kind === "answer" ? reply.text : reply.replacement;
    tray.patch(item.id, {
      chat: [...history, { role: "user", text }, { role: "assistant", text: said }],
    });
    draft.value = "";
  } catch (error) {
    const status = failStatus(error);
    if (status === 503) chrome.toast("No model credential is configured", "warning");
    else if (status === 502) chrome.toast("Both models failed", "destructive");
    else chrome.toast("The model could not reply", "destructive");
  } finally {
    pending.value = false;
  }
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    chatting.value = undefined;
    return;
  }
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void send();
}
</script>

<template>
  <div v-if="tray.count.value" class="tray" data-region="composer-tray">
    <span
      v-for="item in tray.items.value"
      :key="item.id"
      class="chip"
      :data-kind="item.kind"
      data-cmt="tray-chip"
      :data-cmt-label="`${item.kind} waiting to send`"
      data-cmt-tell="About the note I left in the tray"
      :data-cmt-excerpt="item.text"
    >
      <span class="kind mono-meta">{{ item.kind }}</span>
      <span class="what">
        <span v-if="item.quote" class="quote">“{{ item.quote }}”</span>
        <span v-else-if="item.source" class="quote">{{ item.source }}</span>
        {{ item.text }}
      </span>
      <UiIconButton
        v-if="item.kind === 'comment'"
        :icon="MessageSquare"
        label="Chat about this note"
        size="xs"
        :data-open="chatting === item.id"
        @click="toggleChat(item)"
      />
      <UiIconButton
        :icon="X"
        :label="`Take this ${item.kind} out of the tray`"
        size="xs"
        variant="filled"
        @click="tray.remove(item.id)"
      />
    </span>

    <UiSurface v-if="open" class="chat" data-region="tray-chat" pad="none" variant="raised" :data-pending="pending">
      <p v-for="(turn, at) in open.chat" :key="at" class="turn" :data-role="turn.role">{{ turn.text }}</p>
      <p v-if="!open.chat?.length" class="empty mono-meta">Talk about this note. It stays here until you send.</p>
      <UiTextInput
        v-model="draft"
        :disabled="pending"
        placeholder="Ask the fast model…"
        @keydown="onKey"
      />
    </UiSurface>
  </div>
</template>

<style scoped>
.tray {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 6px;
}

.chip {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
  display: inline-flex;
  font-size: 12px;
  gap: 8px;
  height: 30px;
  max-width: 420px;
  padding: 0 4px 0 12px;
}

.kind {
  color: var(--primary);
  flex: none;
}

.chip[data-kind="task"] .kind {
  color: var(--warning);
}

.what {
  color: var(--ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quote {
  color: var(--muted);
}

.chat {
  display: flex;
  flex-basis: 100%;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  width: min(420px, 100%);
}

.chat[data-pending="true"] {
  opacity: 0.72;
}

.turn {
  font-size: 12.5px;
  line-height: 1.45;
  margin: 0;
}

.turn[data-role="user"] {
  color: var(--ink);
}

.turn[data-role="assistant"] {
  color: var(--muted);
}

.empty {
  color: var(--subtle);
  margin: 0;
}
</style>
