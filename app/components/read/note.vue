<script lang="ts" setup>
import { Pencil, Send, X, Zap } from "@lucide/vue";
import type { FastModelReply, FastModelRequest } from "~~/shared/types/models";
import type { TrayItem } from "~/composables/useTray";

const { item, live = true, slug } = defineProps<{
  item: TrayItem;
  live?: boolean;
  slug: string;
}>();

const emit = defineEmits<{ close: []; reload: [] }>();

const chrome = useChrome();
const tray = useTray();
const convo = useConversation();
const draft = ref(item.text);
const editing = ref(false);
const busy = ref<"address" | "edit" | "quick">();

watch(
  () => item.text,
  (text) => {
    if (!editing.value) draft.value = text;
  },
);

function failStatus(error: unknown): number {
  if (typeof error !== "object" || !error) return 0;
  const rec = error as { response?: { status?: unknown }; status?: unknown; statusCode?: unknown };
  if (typeof rec.statusCode === "number") return rec.statusCode;
  if (typeof rec.status === "number") return rec.status;
  if (typeof rec.response?.status === "number") return rec.response.status;
  return 0;
}

function toastFail(error: unknown): void {
  const status = failStatus(error);
  if (status === 503) chrome.toast("No model credential is configured", "warning");
  else if (status === 502) chrome.toast("Both models failed", "destructive");
  else if (status === 409) chrome.toast("That text is not unique on the page", "warning");
  else chrome.toast("That note could not be sent", "destructive");
}

function save(): void {
  const text = draft.value.trim();
  if (!text) return;
  tray.patch(item.id, { text });
  editing.value = false;
}

function discard(): void {
  tray.remove(item.id);
  emit("close");
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    draft.value = item.text;
    editing.value = false;
    return;
  }
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  save();
}

async function address(): Promise<void> {
  if (busy.value) return;
  busy.value = "address";
  try {
    const handover = tray.handOver("", item.id);
    if (!handover.text) return;
    if (!(await convo.deliver(handover.text))) {
      chrome.toast("That note could not be sent", "destructive");
      return;
    }
    handover.settle();
    chrome.toast("Sent to Claude");
    emit("close");
  } finally {
    busy.value = undefined;
  }
}

async function quick(): Promise<void> {
  if (busy.value) return;
  if (!live) {
    chrome.toast("Switch to latest to change the page", "warning");
    return;
  }
  if (!item.quote) {
    chrome.toast("This note has no selection to edit", "warning");
    return;
  }
  busy.value = "quick";
  try {
    const body = {
      context: item.block,
      instruction: item.text,
      selection: item.quote,
      task: "edit",
    } satisfies FastModelRequest;
    const reply = await $fetch<FastModelReply>("/api/models/fast", { body, method: "POST" });
    if (reply.kind !== "edit") {
      chrome.toast("The model answered instead of editing", "warning");
      return;
    }
    await $fetch(`/api/artifacts/${slug}/edit`, {
      body: { block: item.block, replacement: reply.replacement, selection: item.quote },
      method: "POST",
    });
    emit("reload");
    emit("close");
  } catch (error) {
    toastFail(error);
  } finally {
    busy.value = undefined;
  }
}
</script>

<template>
  <div class="note" data-region="gutter-note" :data-busy="busy">
    <blockquote v-if="item.quote" class="quote">{{ item.quote }}</blockquote>

    <UiTextarea
      v-if="editing"
      v-model="draft"
      auto-fit
      placeholder="Edit this note…"
      :rows="2"
      @keydown="onKey"
    />
    <p v-else class="body">{{ item.text }}</p>

    <footer>
      <UiIconButton
        :icon="Pencil"
        label="Edit this note"
        size="xs"
        :disabled="!!busy"
        @click="editing = !editing"
      >
        Edit
      </UiIconButton>
      <UiIconButton :icon="Send" label="Address this note" size="xs" :disabled="!!busy" @click="address">
        Address
      </UiIconButton>
      <UiIconButton :icon="Zap" label="Quick edit from this note" size="xs" :disabled="!!busy" @click="quick">
        Quick edit
      </UiIconButton>
      <UiIconButton :icon="X" label="Remove this note" size="xs" :disabled="!!busy" @click="discard">
        Remove
      </UiIconButton>
    </footer>
  </div>
</template>

<style scoped>
.note {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}

.note[data-busy] {
  opacity: 0.72;
}

.quote {
  background: var(--sunken);
  border-left: 2px solid var(--primary);
  border-radius: 0 6px 6px 0;
  color: var(--muted);
  font-size: 12.5px;
  font-style: italic;
  line-height: 1.5;
  margin: 0;
  padding: 6px 10px;
}

.body {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
