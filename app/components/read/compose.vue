<script lang="ts" setup>
import type { FrameSelection } from "~/types/frame";

const { selection, slug } = defineProps<{ selection?: FrameSelection; slug: string }>();

const emit = defineEmits<{ done: [] }>();

interface Composing {
  left: number;
  quote: string;
  top: number;
}

const POPOVER_W = 400;

const chrome = useChrome();
const tray = useTray();
const composing = ref<Composing>();
const draft = ref("");
const box = ref<{ $el: HTMLTextAreaElement }>();

function start(): void {
  if (!selection) return;
  composing.value = {
    left: Math.max(0, selection.left - POPOVER_W / 2),
    quote: selection.quote,
    top: selection.bottom + 8,
  };
  draft.value = "";
  void nextTick(() => box.value?.$el.focus());
}

function cancel(): void {
  composing.value = undefined;
  draft.value = "";
  emit("done");
}

function save(): void {
  const text = draft.value.trim();
  const held = composing.value;
  if (!text || !held) return;
  tray.add({ kind: "comment", quote: held.quote, source: slug, text });
  composing.value = undefined;
  draft.value = "";
  emit("done");
  chrome.toast("In the tray · sends with your next turn");
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    cancel();
    return;
  }
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  save();
}

onMounted(() => {
  const onWindowKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && composing.value) cancel();
  };
  window.addEventListener("keydown", onWindowKey);
  onScopeDispose(() => window.removeEventListener("keydown", onWindowKey));
});
</script>

<template>
  <button
    v-if="selection && !composing"
    v-island-pop="'bottom center'"
    v-press
    class="raise focusable"
    type="button"
    data-region="select-to-comment"
    :style="{ left: `${selection.left}px`, top: `${selection.top}px` }"
    @mousedown.prevent
    @click="start"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
    Comment
  </button>

  <div v-if="composing" class="scrim" @click="cancel" />

  <UiSurface
    v-if="composing"
    v-island-pop="'top left'"
    class="sheet"
    data-region="read-compose"
    pad="none"
    variant="glass"
    :style="{ left: `${composing.left}px`, top: `${composing.top}px` }"
  >
    <blockquote class="quote">{{ composing.quote }}</blockquote>

    <UiTextarea ref="box" v-model="draft" auto-fit placeholder="Say it to Claude…" :rows="2" @keydown="onKey" />

    <footer>
      <span class="hint mono-meta">↵ to tray · esc cancel</span>
      <button v-press class="ghost focusable" type="button" @click="cancel">Cancel</button>
      <button v-press class="solid focusable" type="button" :disabled="!draft.trim()" @click="save">Add to tray</button>
    </footer>
  </UiSurface>
</template>

<style scoped>
.raise {
  align-items: center;
  background: var(--ink);
  border: 0;
  border-radius: var(--radius-selector);
  box-shadow: var(--shadow-lg);
  color: var(--canvas);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  padding: 7px 12px;
  position: absolute;
  transform: translate(-50%, -100%);
  z-index: 30;
}

.raise svg {
  fill: none;
  height: 12px;
  stroke: currentColor;
  stroke-linejoin: round;
  stroke-width: 2.2;
  width: 12px;
}

.scrim {
  inset: 0;
  position: fixed;
  z-index: 30;
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: calc(100% - 24px);
  padding: 12px 14px;
  position: absolute;
  width: 400px;
  z-index: 31;
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
  max-height: 64px;
  overflow: hidden;
  padding: 6px 10px;
}

footer {
  align-items: center;
  display: flex;
  gap: 10px;
}

.hint {
  color: var(--subtle);
  margin-right: auto;
}

.ghost,
.solid {
  border-radius: var(--radius-field);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
}

.ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
}

.solid {
  background: var(--ink);
  border: 0;
  color: var(--canvas);
}

.solid:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
