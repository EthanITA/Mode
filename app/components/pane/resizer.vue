<script lang="ts" setup>
const width = defineModel<number>({ required: true });
const {
  initial,
  label,
  max = 640,
  min = 200,
} = defineProps<{ initial: number; label: string; max?: number; min?: number }>();

const STEP = 16;
// What the pane beside it keeps however far the handle is dragged.
const MAIN_MIN = 360;

const handle = useTemplateRef<HTMLElement>("handle");
const isDragging = ref(false);
let startX = 0;
let startWidth = 0;

function bound(next: number): number {
  const room = (handle.value?.parentElement?.clientWidth ?? Number.POSITIVE_INFINITY) - MAIN_MIN;
  return Math.round(Math.max(min, Math.min(next, max, room)));
}

function onDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  startX = event.clientX;
  startWidth = width.value;
  isDragging.value = true;
  handle.value?.setPointerCapture(event.pointerId);
  // A frame or an editor under the pointer would swallow the drag, so they go inert until it ends.
  document.documentElement.dataset.paneDragging = "";
}

function onMove(event: PointerEvent): void {
  if (isDragging.value) width.value = bound(startWidth + event.clientX - startX);
}

function onUp(): void {
  isDragging.value = false;
  delete document.documentElement.dataset.paneDragging;
}

function onKey(event: KeyboardEvent): void {
  const next: Record<string, number> = {
    ArrowLeft: width.value - STEP,
    ArrowRight: width.value + STEP,
    End: max,
    Home: min,
  };
  if (!(event.key in next)) return;
  event.preventDefault();
  width.value = bound(next[event.key] ?? width.value);
}

onScopeDispose(onUp);
</script>

<template>
  <div
    ref="handle"
    class="resizer focusable"
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuemax="max"
    :aria-valuemin="min"
    :aria-valuenow="width"
    :data-dragging="isDragging"
    title="Drag to resize, double-click to reset"
    @dblclick="width = bound(initial)"
    @keydown="onKey"
    @lostpointercapture="onUp"
    @pointercancel="onUp"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
  />
</template>

<style scoped>
/* Sits in a zero-width grid track, so the hit area reaches into the gap on both sides. */
.resizer {
  cursor: col-resize;
  height: 100%;
  margin-inline: -6px;
  position: relative;
  touch-action: none;
  width: 12px;
  z-index: 2;
}

.resizer::after {
  background: var(--primary);
  border-radius: 999px;
  content: "";
  inset: 12px 5px;
  opacity: 0;
  position: absolute;
  transition: opacity var(--duration-base) var(--ease-out);
}

.resizer:hover::after,
.resizer:focus-visible::after,
.resizer[data-dragging="true"]::after {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .resizer::after {
    transition: none;
  }
}
</style>

<style>
:root[data-pane-dragging] {
  cursor: col-resize;
  user-select: none;
}

:root[data-pane-dragging] iframe,
:root[data-pane-dragging] .monaco-editor {
  pointer-events: none;
}
</style>
