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
const sc = useSidecar();
const instruction = ref("");
const pending = ref(false);
const field = ref<{ $el: HTMLInputElement }>();
const panel = ref<HTMLElement>();

const left = computed(() => Math.max(0, selection.left - PANEL_W / 2));
const top = computed(() => selection.bottom + 8);

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

function contextOf(): string {
  return [selection.mark.text, selection.path, sc.artifact.value?.path].filter(Boolean).join("\n");
}

async function ask(): Promise<void> {
  const text = instruction.value.trim();
  if (!text || pending.value) return;
  if (!live) {
    chrome.toast("Switch to latest to change the page", "warning");
    return;
  }
  pending.value = true;
  try {
    const body = {
      context: contextOf(),
      instruction: text,
      selection: selection.quote,
      task: "edit",
    } satisfies FastModelRequest;
    const reply = await $fetch<FastModelReply>("/api/models/fast", { body, method: "POST" });
    if (reply.kind !== "edit") {
      chrome.toast("The model answered instead of editing", "warning");
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

function outside(node: EventTarget | undefined): boolean {
  const el = node as { closest?: (sel: string) => Element | null } | undefined;
  return !el?.closest?.("[data-region='inline-panel']");
}

onMounted(() => {
  void nextTick(() => field.value?.$el.focus());
  const onWin = (event: KeyboardEvent): void => {
    if (event.key === "Escape") emit("done");
  };
  const onFocus = (event: FocusEvent): void => {
    if (outside(event.relatedTarget ?? document.activeElement ?? undefined)) emit("done");
  };
  const onDown = (event: MouseEvent): void => {
    if (outside(event.target ?? undefined)) emit("done");
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
