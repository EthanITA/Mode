<script lang="ts" setup>
import type { FastModelReply, FastModelRequest } from "~~/shared/types/models";
import type { FrameSelection } from "~/types/frame";

const props = defineProps<{
  held?: boolean;
  live?: boolean;
  selection: FrameSelection;
  slug: string;
}>();

const emit = defineEmits<{ applied: []; done: [] }>();

const PANEL_W = 320;

const chrome = useChrome();
const sc = useSidecar();
const instruction = ref("");
const pending = ref(false);
const field = ref<{ $el: HTMLInputElement }>();
const panel = ref<HTMLElement>();

const left = computed(() => Math.max(0, props.selection.left - PANEL_W / 2));
const top = computed(() => props.selection.bottom + 8);

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
  else chrome.toast("The model could not finish that", "destructive");
}

function editMessage(error: unknown): string {
  if (typeof error !== "object" || !error) return "The edit could not be applied";
  const rec = error as { data?: unknown; statusMessage?: unknown };
  const data = rec.data;
  if (typeof data === "object" && data) {
    const body = data as { statusMessage?: unknown; message?: unknown };
    if (typeof body.statusMessage === "string" && body.statusMessage) return body.statusMessage;
    if (typeof body.message === "string" && body.message) return body.message;
  }
  if (typeof rec.statusMessage === "string" && rec.statusMessage) return rec.statusMessage;
  return "The edit could not be applied";
}

function contextOf(): string {
  return [props.selection.mark.text, props.selection.path, sc.artifact.value?.path].filter(Boolean).join("\n");
}

async function ask(): Promise<void> {
  const text = instruction.value.trim();
  if (!text || pending.value) return;
  const { live = true, selection, slug } = props;
  if (!live) {
    chrome.toast("Switch to latest to change the page", "warning");
    return;
  }
  const quote = selection.quote;
  pending.value = true;
  try {
    const body = {
      context: contextOf(),
      instruction: text,
      selection: quote,
      task: "edit",
    } satisfies FastModelRequest;
    const reply = await $fetch<FastModelReply>("/api/models/fast", { body, method: "POST" });
    if (reply.kind !== "edit") {
      chrome.toast("The model answered instead of editing", "warning");
      return;
    }
    try {
      await $fetch(`/api/artifacts/${slug}/edit`, {
        body: { path: selection.path, replacement: reply.replacement, selection: quote },
        method: "POST",
      });
    } catch (error) {
      chrome.toast(editMessage(error), "destructive");
      return;
    }
    emit("applied");
  } catch (error) {
    toastFail(error);
  } finally {
    pending.value = false;
  }
}

function dismiss(): void {
  if (props.held) return;
  emit("done");
}

function dismissIdle(): void {
  // Disable-on-pending blurs the field; that must not abort the in-flight edit.
  if (pending.value) return;
  dismiss();
}

function onFieldKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    dismiss();
    return;
  }
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void ask();
}

function outside(node: EventTarget | undefined): boolean {
  const el = node as { closest?: (sel: string) => Element | null } | undefined;
  return !el?.closest?.("[data-region='inline-panel']");
}

onMounted(() => {
  void nextTick(() => field.value?.$el.focus());
  const onWin = (event: KeyboardEvent): void => {
    if (event.key === "Escape") dismiss();
  };
  const onFocus = (event: FocusEvent): void => {
    if (outside(event.relatedTarget ?? document.activeElement ?? undefined)) dismissIdle();
  };
  const onDown = (event: MouseEvent): void => {
    if (outside(event.target ?? undefined)) dismissIdle();
  };
  window.addEventListener("keydown", onWin);
  window.addEventListener("mousedown", onDown);
  panel.value?.addEventListener("focusout", onFocus);
  onScopeDispose(() => {
    window.removeEventListener("keydown", onWin);
    window.removeEventListener("mousedown", onDown);
    panel.value?.removeEventListener("focusout", onFocus);
  });
});
</script>

<template>
  <div ref="panel" class="wrap" data-region="inline-panel" :style="{ left: `${left}px`, top: `${top}px` }">
  <UiSurface
    class="panel"
    pad="none"
    variant="glass"
    :data-pending="pending"
  >
    <UiTextInput
      ref="field"
      v-model="instruction"
      :disabled="pending"
      placeholder="Change this to…"
      @keydown="onFieldKey"
    />
    <footer>
      <span class="hint mono-meta">{{ pending ? "working…" : "↵ edit · esc close" }}</span>
    </footer>
  </UiSurface>
  </div>
</template>

<style scoped>
.wrap {
  max-width: calc(100% - 24px);
  position: absolute;
  width: 320px;
  z-index: 31;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
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

@media (prefers-reduced-motion: reduce) {
  .panel {
    transition: none;
  }
}
</style>
