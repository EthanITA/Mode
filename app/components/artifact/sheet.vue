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
      <!-- One header grown or not, so the title island and an address being typed in it survive the switch. -->
      <header
        v-if="isExpanded || hasBar"
        class="head"
        :data-expanded="isExpanded"
        :data-region="isExpanded ? 'full-island' : 'sheet-bar'"
      >
        <UiSurface
          v-if="isExpanded"
          class="island"
          data-region="nav-island"
          pad="none"
          shape="pill"
          variant="glass-liquid"
        >
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
        <span class="spacer" />
        <UiSurface v-if="isExpanded" class="island" pad="none" shape="pill" variant="glass-liquid">
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
        <template v-else>
          <WebElsewhere v-if="kind === 'web'" />
          <span class="actions">
            <ChromeCommentToggle shape="inset" />
            <ChromeAction
              data-region="artifact-fullscreen"
              :icon="Maximize2"
              shape="inset"
              tip="Fullscreen · {F}"
              @click="artifact.isFull = true"
            />
          </span>
        </template>
      </header>
      <template v-if="path && slug && conversation">
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
  @apply flex min-h-0 min-w-0;
}

.preview {
  @apply flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden;
}

/* Fixed, so it fills the window past the shell's max width; the header sits above the page, never over it. */
.preview[data-expanded="true"] {
  @apply fixed inset-0 z-10 rounded-none border-0 bg-canvas shadow-lg;
}

.preview[data-expanded="true"] .read {
  @apply bg-raised;
}

.head {
  @apply relative flex h-14 flex-none items-center gap-1.5 border-b border-b-border px-2 whitespace-nowrap;
}

.head[data-expanded="true"] {
  @apply z-30 gap-2;
}

.island {
  @apply flex h-(--island-row-h) flex-none items-center gap-0.5 px-1;
}

/* Centred on the sheet rather than between its neighbours, and narrowed before it reaches them. */
.middle {
  @apply absolute top-2 left-1/2 w-150 max-w-[calc(100%_-_300px)] -translate-x-1/2;
}

/* The design measures the grown one inside an 8px inset, so its 320px is 336px of the window. */
.head[data-expanded="true"] .middle {
  @apply max-w-[calc(100%_-_336px)];
}

.spacer {
  @apply flex-1;
}

.actions {
  @apply flex items-center gap-0.5;
}

.named {
  @apply w-full justify-center px-4 py-0;
}

.name {
  @apply min-w-0 truncate typo-body-strong font-bold;
}

/* The reader sizes its frame to the page, so this pane owns the scroll. */
.read {
  @apply min-h-0 flex-1 overflow-y-auto px-0 pt-4 pb-(--float-clear);
}

/* A live page scrolls itself and runs to the sheet's edges, with its notes over it. */
.read[data-kind="web"] {
  @apply flex overflow-hidden p-0;
}

/* A file brings its own bar and scrolls itself, so the sheet only lends it the room. */
.read[data-kind="files"] {
  @apply flex flex-col overflow-hidden p-0;
}
</style>
