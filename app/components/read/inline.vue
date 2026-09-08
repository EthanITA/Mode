<script lang="ts" setup>
import type { FastModelReply, FastModelRequest } from "~~/shared/types/models";
import type { FrameSelection } from "~/types/frame";

const { live = true, selection, slug } = defineProps<{
  live?: boolean;
  selection: FrameSelection;
  slug: string;
}>();

const emit = defineEmits<{ applied: []; done: [] }>();

const PANEL_W = 320;

const chrome = useChrome();
const instruction = ref("");
const task = ref<"answer" | "edit">("edit");
const pinned = ref(false);
const pending = ref(false);
const answer = ref<string>();
const field = ref<{ $el: HTMLInputElement }>();

const left = computed(() => Math.max(0, selection.left - PANEL_W / 2));
const top = computed(() => selection.bottom + 8);

function readsAsQuestion(text: string): boolean {
  const held = text.trim();
  if (held.endsWith("?")) return true;
  return /^(are|can|could|did|do|does|how|is|should|what|when|where|which|who|whose|why|will|would)\b/i.test(held);
}

watch(instruction, (text) => {
  if (pinned.value) return;
  task.value = readsAsQuestion(text) ? "answer" : "edit";
});

function pick(next: "answer" | "edit"): void {
  pinned.value = true;
  task.value = next;
}

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
  else chrome.toast("The model could not finish that", "destructive");
}

async function ask(): Promise<void> {
  const text = instruction.value.trim();
  if (!text || pending.value) return;
  if (task.value === "edit" && !live) {
    chrome.toast("Switch to latest to change the page", "warning");
    return;
  }
  pending.value = true;
  try {
    const body = {
      context: selection.mark.text,
      instruction: text,
      selection: selection.quote,
      task: task.value,
    } satisfies FastModelRequest;
    const reply = await $fetch<FastModelReply>("/api/models/fast", { body, method: "POST" });
    if (reply.kind === "answer") {
      answer.value = reply.text;
      return;
    }
    await $fetch(`/api/artifacts/${slug}/edit`, {
      body: { block: selection.mark.text, replacement: reply.replacement, selection: selection.quote },
      method: "POST",
    });
    emit("applied");
    emit("done");
  } catch (error) {
    toastFail(error);
  } finally {
    pending.value = false;
  }
}

function onFieldKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    emit("done");
    return;
  }
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void ask();
}

function dismissAnswer(): void {
  answer.value = undefined;
  emit("done");
}

onMounted(() => {
  void nextTick(() => field.value?.$el.focus());
  const onWin = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (answer.value) dismissAnswer();
    else emit("done");
  };
  const onClick = (event: MouseEvent): void => {
    if (!answer.value) return;
    const node = event.target as { closest?: (sel: string) => Element | null } | undefined;
    if (node?.closest?.("[data-region='inline-answer']")) return;
    dismissAnswer();
  };
  window.addEventListener("keydown", onWin);
  window.addEventListener("mousedown", onClick);
  onScopeDispose(() => {
    window.removeEventListener("keydown", onWin);
    window.removeEventListener("mousedown", onClick);
  });
});
</script>

<template>
  <UiSurface
    v-if="!answer"
    class="panel"
    data-region="inline-panel"
    pad="none"
    variant="glass"
    :data-pending="pending"
    :style="{ left: `${left}px`, top: `${top}px` }"
  >
    <UiTextInput
      ref="field"
      v-model="instruction"
      :disabled="pending"
      :placeholder="task === 'answer' ? 'Ask about this…' : 'Change this to…'"
      @keydown="onFieldKey"
    />
    <footer>
      <UiChip size="xs" :selected="task === 'edit'" :disabled="pending" @click="pick('edit')">Edit</UiChip>
      <UiChip size="xs" :selected="task === 'answer'" :disabled="pending" @click="pick('answer')">Answer</UiChip>
      <span class="hint mono-meta">{{ pending ? "working…" : "↵ run · esc close" }}</span>
    </footer>
  </UiSurface>

  <UiSurface
    v-else
    class="bubble"
    data-region="inline-answer"
    pad="none"
    variant="raised"
    :style="{ left: `${left}px`, top: `${top}px` }"
  >
    <p>{{ answer }}</p>
    <span class="hint mono-meta">esc or click away</span>
  </UiSurface>
</template>

<style scoped>
.panel,
.bubble {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: calc(100% - 24px);
  padding: 10px 12px;
  position: absolute;
  width: 320px;
  z-index: 31;
}

.panel[data-pending="true"] {
  opacity: 0.72;
}

footer {
  align-items: center;
  display: flex;
  gap: 6px;
}

.hint {
  color: var(--subtle);
  margin-left: auto;
}

.bubble p {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .panel,
  .bubble {
    transition: none;
  }
}
</style>
