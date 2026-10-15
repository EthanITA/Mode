<script lang="ts" setup>
import { EASE_CSS, MOTION_DURATION, prefersReducedMotion } from "@cela/design/utils/motion";
import { Maximize2, Minimize2, PanelLeft } from "@lucide/vue";
import { useEventListener } from "@vueuse/core";
import type { ComponentPublicInstance } from "vue";
import { isTyping } from "~~/lib/web/page/blocks";
import type { ArtifactKind } from "~~/shared/types/artifact";

const { conversation, kind, path, slug } = defineProps<{
  conversation?: string;
  kind?: ArtifactKind;
  path?: string;
  slug?: string;
}>();

type Box = { height: number; left: number; top: number; width: number };

// The sheet itself grows, so the frame inside it never reloads.
const GROW = { duration: MOTION_DURATION.slow, easing: EASE_CSS.drawer } satisfies KeyframeAnimationOptions;
const SHRINK = { duration: MOTION_DURATION.base, easing: EASE_CSS.drawer } satisfies KeyframeAnimationOptions;
const LIST: Partial<Record<Face, string>> = { artifacts: "Artifacts", files: "Files" };

const sc = useSidecar();
const chrome = useChrome();
const artifact = $artifact();
const shown = useFaceShown();
const isExpanded = ref(false);
const slot = useTemplateRef<HTMLElement>("slot");
const preview = useTemplateRef<ComponentPublicInstance>("preview");
const read = useTemplateRef<HTMLElement>("read");
const hasBar = computed(() => !!(path && slug && conversation));
const list = computed(() => LIST[chrome.view.current.value] ?? "Artifacts");
const title = computed(() => {
  const meta = slug ? sc.catalogue.value.find((one) => one.slug === slug) : undefined;
  return meta?.title || (slug ? deslug(slug) : path ? basename(path) : "");
});
// Where the reading starts at rest, which the grown sheet eases its padding from so the words never jump.
let rest = { offset: 0, radius: "0px" };
let growth: Animation | undefined;

// In viewport terms, since that is what a fixed sheet's left and top mean.
function boxOf(el: Element): Box {
  const { height, left, top, width } = el.getBoundingClientRect();
  return { height, left, top, width };
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

function offsetIn(pane: HTMLElement, el: HTMLElement): number {
  return el.getBoundingClientRect().top - pane.getBoundingClientRect().top + el.clientTop;
}

const padOf = (el: HTMLElement): number => Number.parseFloat(getComputedStyle(el).paddingTop);

async function expand(): Promise<void> {
  const pane = preview.value?.$el;
  if (!(pane instanceof HTMLElement) || !slot.value) return;
  const from = boxOf(slot.value);
  rest = {
    offset: read.value ? offsetIn(pane, read.value) + padOf(read.value) : 0,
    radius: getComputedStyle(pane).borderRadius,
  };
  isExpanded.value = true;
  await nextTick();
  if (prefersReducedMotion()) return;
  growth?.cancel();
  growth = pane.animate([frameOf(from, rest.radius, "sm"), frameOf(boxOf(pane), "0px", "lg")], GROW);
  if (!read.value) return;
  const settled = padOf(read.value);
  const start = Math.max(0, rest.offset - offsetIn(pane, read.value));
  read.value.animate([{ paddingTop: `${start}px` }, { paddingTop: `${settled}px` }], GROW);
}

async function collapse(): Promise<void> {
  const pane = preview.value?.$el;
  if (!(pane instanceof HTMLElement) || !slot.value || !isExpanded.value || prefersReducedMotion()) {
    isExpanded.value = false;
    return;
  }
  growth?.cancel();
  // Held on its last frame until the class comes off, or the sheet would flash full size for a frame.
  const shrink = pane.animate([frameOf(boxOf(pane), "0px", "lg"), frameOf(boxOf(slot.value), rest.radius, "sm")], {
    ...SHRINK,
    fill: "forwards",
  });
  const settle = read.value?.animate(
    [
      { paddingTop: `${padOf(read.value)}px` },
      { paddingTop: `${Math.max(0, rest.offset - offsetIn(pane, read.value))}px` },
    ],
    { ...SHRINK, fill: "forwards" },
  );
  growth = shrink;
  await shrink.finished.catch(() => undefined);
  if (growth !== shrink) return;
  isExpanded.value = false;
  await nextTick();
  shrink.cancel();
  settle?.cancel();
}

watch(
  () => artifact.isFull,
  (full) => {
    if (shown.value) void (full ? expand() : collapse());
  },
);
watch(
  () => conversation,
  () => {
    if (shown.value) artifact.isFull = false;
  },
);
// Post flush, so a face leaving on the same switch has already cleared it.
watchEffect(
  () => {
    if (shown.value) artifact.canGrow = !!(path && conversation);
  },
  { flush: "post" },
);
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (!shown.value) return;
  // Read once the press is done, since the app's handler, listening after this one, claims it when Esc closes comment mode.
  if (event.key === "Escape" && artifact.isFull)
    setTimeout(() => {
      if (!event.defaultPrevented) artifact.isFull = false;
    });
  const isPlain = !(event.metaKey || event.ctrlKey || event.altKey || event.repeat || isTyping(event.target));
  if (isPlain && event.key.toLowerCase() === "f") artifact.toggleFull();
});
onBeforeUnmount(() => {
  artifact.isFull = false;
  artifact.canGrow = false;
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
      <div v-if="isExpanded" class="strip" data-region="full-island">
        <UiSurface class="island" data-region="nav-island" pad="none" shape="pill" variant="glass-liquid">
          <ChromeAction
            data-region="open-list"
            :icon="PanelLeft"
            :is-pressed="artifact.isListed"
            shape="inset"
            :tip="`${artifact.isListed ? 'Hide' : 'Show'} ${list}`"
            @click="artifact.isListed = !artifact.isListed"
          />
        </UiSurface>
        <div class="middle">
          <WebTitle v-if="kind === 'web' && slug && conversation" :slug="slug" />
          <UiSurface
            v-else
            class="island named"
            data-region="title-island"
            pad="none"
            shape="pill"
            variant="glass-liquid"
          >
            <span class="name">{{ title }}</span>
          </UiSurface>
        </div>
        <UiSurface class="island" pad="none" shape="pill" variant="glass-liquid">
          <ChromeCommentToggle v-if="hasBar" shape="inset" />
          <ChromeThemeToggle shape="inset" />
          <ChromeAction
            data-region="artifact-fullscreen"
            :icon="Minimize2"
            shape="inset"
            tip="Exit fullscreen · {esc}"
            @click="artifact.isFull = false"
          />
        </UiSurface>
      </div>
      <template v-if="path && slug && conversation">
        <header v-if="!isExpanded" class="bar">
          <WebBar v-if="kind === 'web'" :slug="slug" />
          <span v-else class="path">{{ homePath(path) }}</span>
          <ChromeCommentToggle shape="pill" />
          <ChromeAction
            data-region="artifact-fullscreen"
            :icon="Maximize2"
            label="Fullscreen"
            shape="pill"
            tip="Grow the page over everything · {F}"
            @click="artifact.isFull = true"
          />
        </header>
        <div ref="read" class="read" :data-kind="kind">
          <WebReader v-if="kind === 'web'" :conversation="conversation" :slug="slug" />
          <ArtifactReader v-else :conversation="conversation" :slug="slug" />
        </div>
      </template>
      <div v-else ref="read" class="read" data-kind="files">
        <slot />
      </div>
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

/* Fixed, so it fills the window past the shell's max width; the islands' strip sits above the page, never over it. */
.preview[data-expanded="true"] {
  background: var(--canvas);
  border: 0;
  border-radius: 0;
  box-shadow: var(--shadow-lg);
  inset: 0;
  padding-top: 56px;
  position: fixed;
  z-index: 10;
}

.preview[data-expanded="true"] .read {
  background: var(--raised);
  border-top: 1px solid var(--border);
}

.strip {
  align-items: center;
  display: flex;
  gap: 8px;
  left: 8px;
  pointer-events: none;
  position: absolute;
  right: 8px;
  top: 8px;
  white-space: nowrap;
  z-index: 30;
}

.island {
  align-items: center;
  display: flex;
  flex: none;
  gap: 2px;
  height: var(--island-row-h);
  padding: 0 4px;
  pointer-events: auto;
}

/* Centred on the window rather than between its neighbours, and narrowed before it reaches them. */
.middle {
  left: 50%;
  max-width: calc(100% - 320px);
  pointer-events: auto;
  position: absolute;
  top: 0;
  translate: -50% 0;
  width: 600px;
}

.strip > .island:last-child {
  margin-left: auto;
}

.named {
  box-sizing: border-box;
  justify-content: center;
  padding: 0 16px;
  width: 100%;
}

.name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* A live page scrolls itself and runs to the sheet's edges, with its notes over it. */
.read[data-kind="web"] {
  display: flex;
  overflow: hidden;
  padding: 0;
}

/* A file brings its own bar and scrolls itself, so the sheet only lends it the room. */
.read[data-kind="files"] {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}
</style>
