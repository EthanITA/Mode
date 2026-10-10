<script lang="ts" setup>
import { EASE_CSS, MOTION_DURATION, prefersReducedMotion } from "@cela/design/utils/motion";
import { Maximize2 } from "@lucide/vue";
import { useEventListener } from "@vueuse/core";
import type { ComponentPublicInstance } from "vue";

const { conversation, path, slug } = defineProps<{ conversation?: string; path?: string; slug?: string }>();

type Box = { height: number; left: number; top: number; width: number };

// The sheet itself grows, so the frame inside it never reloads.
const GROW = { duration: MOTION_DURATION.slow, easing: EASE_CSS.drawer } satisfies KeyframeAnimationOptions;
const SHRINK = { duration: MOTION_DURATION.base, easing: EASE_CSS.drawer } satisfies KeyframeAnimationOptions;

const isFull = useArtifactFullscreen();
const isExpanded = ref(false);
const slot = useTemplateRef<HTMLElement>("slot");
const preview = useTemplateRef<ComponentPublicInstance>("preview");
const bar = useTemplateRef<HTMLElement>("bar");
const read = useTemplateRef<HTMLElement>("read");
let rest = { pad: 0, radius: "0px" };
let growth: Animation | undefined;

function boxOf(el: Element, frame: Element): Box {
  const box = el.getBoundingClientRect();
  const origin = frame.getBoundingClientRect();
  return { height: box.height, left: box.left - origin.left, top: box.top - origin.top, width: box.width };
}

function frameOf({ height, left, top, width }: Box, radius: string, depth: "lg" | "sm"): Keyframe {
  const shadow = getComputedStyle(document.documentElement).getPropertyValue(`--shadow-${depth}`).trim();
  return {
    borderRadius: radius,
    boxShadow: shadow,
    height: `${height}px`,
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
  };
}

async function expand(): Promise<void> {
  const pane = preview.value?.$el;
  if (!(pane instanceof HTMLElement) || !slot.value) return;
  const stage = pane.offsetParent ?? document.body;
  const from = boxOf(slot.value, stage);
  const pad = read.value
    ? Number.parseFloat(getComputedStyle(read.value).paddingTop) + (bar.value?.offsetHeight ?? 0)
    : 0;
  rest = { pad, radius: getComputedStyle(pane).borderRadius };
  isExpanded.value = true;
  await nextTick();
  if (prefersReducedMotion()) return;
  growth?.cancel();
  growth = pane.animate([frameOf(from, rest.radius, "sm"), frameOf(boxOf(pane, stage), "0px", "lg")], GROW);
  if (read.value)
    read.value.animate([{ paddingTop: `${pad}px` }, { paddingTop: getComputedStyle(read.value).paddingTop }], GROW);
}

async function collapse(): Promise<void> {
  const pane = preview.value?.$el;
  if (!(pane instanceof HTMLElement) || !slot.value || !isExpanded.value || prefersReducedMotion()) {
    isExpanded.value = false;
    return;
  }
  const stage = pane.offsetParent ?? document.body;
  growth?.cancel();
  // Held on its last frame until the class comes off, or the sheet would flash full size for a frame.
  const shrink = pane.animate(
    [frameOf(boxOf(pane, stage), "0px", "lg"), frameOf(boxOf(slot.value, stage), rest.radius, "sm")],
    {
      ...SHRINK,
      fill: "forwards",
    },
  );
  const settle = read.value?.animate(
    [{ paddingTop: getComputedStyle(read.value).paddingTop }, { paddingTop: `${rest.pad}px` }],
    {
      ...SHRINK,
      fill: "forwards",
    },
  );
  growth = shrink;
  await shrink.finished.catch(() => undefined);
  if (growth !== shrink) return;
  isExpanded.value = false;
  await nextTick();
  shrink.cancel();
  settle?.cancel();
}

watch(isFull, (full) => void (full ? expand() : collapse()));
watch([() => path, () => conversation], () => {
  isFull.value = false;
});
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.key === "Escape" && !event.defaultPrevented && isFull.value) isFull.value = false;
});
onBeforeUnmount(() => {
  isFull.value = false;
});
</script>

<template>
  <div ref="slot" class="slot">
    <UiSurface
      ref="preview"
      class="preview"
      data-region="artifact-sheet"
      :data-expanded="isExpanded"
      pad="none"
      variant="raised"
    >
      <template v-if="path && slug && conversation">
        <header ref="bar" class="bar">
          <span class="path">{{ homePath(path) }}</span>
          <ChromeCommentToggle shape="pill" />
          <ChromeAction
            data-region="artifact-fullscreen"
            :icon="Maximize2"
            label="Fullscreen"
            shape="pill"
            tip="Grow the page over everything · esc shrinks it back"
            @click="isFull = true"
          />
        </header>
        <div ref="read" class="read">
          <ArtifactReader :conversation="conversation" :slug="slug" />
        </div>
      </template>
      <slot v-else />
    </UiSurface>
  </div>
</template>

<style scoped>
/* The slot keeps the grid track while the sheet inside it grows out, and is where it shrinks back to. */
.slot {
  display: flex;
  min-height: 0;
  min-width: 0;
}

.preview {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* Absolute against the face's stage: over the whole face, and still under the island and dock rows. */
.preview[data-expanded="true"] {
  border-radius: 0;
  box-shadow: var(--shadow-lg);
  inset: 0;
  position: absolute;
  z-index: 10;
}

.preview[data-expanded="true"] .bar {
  display: none;
}

.preview[data-expanded="true"] .read {
  padding: var(--stage-top) 0 calc(var(--dock-h, var(--dock-rest-h)) + var(--gutter) * 2);
}

.bar {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 8px 12px;
}

.path {
  flex: 1;
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* The reader sizes its frame to the page, so this pane owns the scroll. */
.read {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 0 var(--float-clear);
}
</style>
