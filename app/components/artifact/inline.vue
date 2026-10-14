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
      chrome.toast(failReason(error) ?? "The edit could not be applied", "destructive");
      return;
    }
    emit("applied");
  } catch (error) {
    chrome.toast(failReason(error) ?? "The model could not finish that", "destructive");
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
  <div
    ref="panel"
    class="wrap"
    data-region="inline-panel"
    data-tip="Edit · {enter}, {esc} closes"
    :style="{ left: `${left}px`, top: `${top}px` }"
  >
    <UiSurface class="panel" pad="none" variant="glass" :data-pending="pending">
      <UiTextInput
        ref="field"
        v-model="instruction"
        :disabled="pending"
        placeholder="Change this to…"
        @keydown="onFieldKey"
      />
      <footer v-if="pending">
        <span class="hint working mono-meta">working…</span>
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
  margin-left: auto;
}

.working {
  @apply shimmer;
  color: var(--subtle);
}

@media (prefers-reduced-motion: reduce) {
  .panel {
    transition: none;
  }
}
</style>
