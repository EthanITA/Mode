<script lang="ts" setup>
import { useElementSize } from "@vueuse/core";
import type { FrameAnchor, FrameMark } from "~/types/frame";
import { OneDarkVivid } from "~/utils/monaco/one-dark-vivid";
import type { PreviewKind, PreviewScroll } from "~/utils/preview";
import { measure, readAnchors } from "~~/lib/web/page/blocks";

const {
  file,
  inset = 0,
  kind,
  src,
} = defineProps<{
  /** Given only where notes on the rendering have somewhere to show, which turns block picking on. */
  file?: string;
  inset?: number;
  kind: PreviewKind;
  src: string;
}>();
const zoom = defineModel<number>("zoom", { required: true });
const emit = defineEmits<{
  anchors: [anchors: FrameAnchor[]];
  engage: [];
  marks: [marks: FrameMark[]];
  scrolled: [at: PreviewScroll];
}>();

const look = useTheme();
const scroller = useTemplateRef<HTMLElement>("scroller");
const content = useTemplateRef<HTMLElement>("content");
const frame = ref<HTMLIFrameElement>();

// The frame scrolls itself, so marks are measured where the blocks sit on screen.
const pick = useCommentPick({
  frame,
  inset: () => inset,
  measure: (doc, indexed) => {
    emit("marks", measure(indexed, 0));
    emit("anchors", readAnchors(doc, 0));
  },
  owner: () => ({ file }),
});
const { width: room } = useElementSize(scroller);
const { height: tall } = useElementSize(content);
const natural = ref(0);
const isLoaded = ref(false);
const isBroken = ref(false);

let teardown: (() => void)[] = [];

const isFramed = computed(() => kind === "markdown" || kind === "page" || kind === "pdf");
// Never wider than it really is, so a small icon is not blown up into a blur.
const width = computed(() => (natural.value ? Math.min(natural.value, room.value) : room.value));
const title = computed(() => decodeURIComponent(src.split("?")[0]?.split("/").pop() ?? ""));

function positionOf(el: Element): PreviewScroll {
  const x = el.scrollWidth - el.clientWidth;
  const y = el.scrollHeight - el.clientHeight;
  return { x: x > 0 ? el.scrollLeft / x : 0, y: y > 0 ? el.scrollTop / y : 0 };
}

// A page scrolls inside its own frame, sized to the pane, so its 100vh sections keep their height.
function scrollerOf(): Element | undefined {
  return (isFramed.value ? frame.value?.contentDocument?.scrollingElement : scroller.value) ?? undefined;
}

function follow(at: PreviewScroll): void {
  const el = scrollerOf();
  if (!el) return;
  el.scrollLeft = at.x * (el.scrollWidth - el.clientWidth);
  el.scrollTop = at.y * (el.scrollHeight - el.clientHeight);
}

function onScroll(): void {
  const el = scrollerOf();
  if (el) emit("scrolled", positionOf(el));
}

// The content point under the pointer is put back under it once the new size has laid out.
async function zoomAt(event: WheelEvent): Promise<void> {
  const box = content.value?.getBoundingClientRect();
  const was = zoom.value;
  const next = Preview.pinch(was, event.deltaY);
  if (!box || next === was) return;
  const x = (event.clientX - box.left) / was;
  const y = (event.clientY - box.top) / was;
  zoom.value = next;
  await nextTick();
  const after = content.value?.getBoundingClientRect();
  if (!after || !scroller.value) return;
  scroller.value.scrollLeft += after.left + x * next - event.clientX;
  scroller.value.scrollTop += after.top + y * next - event.clientY;
}

function onWheel(event: WheelEvent): void {
  emit("engage");
  if (!(event.ctrlKey || event.metaKey) || !Preview.isZoomable(kind)) return;
  event.preventDefault();
  void zoomAt(event);
}

function onMedia(event: Event): void {
  const el = event.target;
  natural.value = el instanceof HTMLImageElement ? el.naturalWidth : el instanceof HTMLVideoElement ? el.videoWidth : 0;
  isLoaded.value = true;
}

function frameDoc(): Document | undefined {
  return kind === "pdf" ? undefined : (frame.value?.contentDocument ?? undefined);
}

// CSS zoom on the page's root reflows it the way the browser's own zoom does.
function zoomFrame(): void {
  const doc = frameDoc();
  if (doc) doc.documentElement.style.zoom = zoom.value === 1 ? "" : String(zoom.value);
}

function unhook(): void {
  for (const off of teardown) off();
  teardown = [];
  pick.detach();
}

function onFrameLoad(): void {
  unhook();
  isLoaded.value = true;
  const doc = frameDoc();
  const win = frame.value?.contentWindow;
  if (!doc || !win) return;
  if (kind === "markdown") doc.documentElement.setAttribute("data-theme", look.theme.value);
  zoomFrame();
  // A pinch inside the frame would otherwise zoom the whole sidecar.
  const onFrameWheel = (event: WheelEvent): void => {
    emit("engage");
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    zoom.value = Preview.pinch(zoom.value, event.deltaY);
  };
  const onEngage = (): void => emit("engage");
  // A link opens away, since following it inside the frame would leave the file behind.
  const onClick = (event: MouseEvent): void => {
    const link = event.target instanceof Element ? event.target.closest("a[href^='http']") : undefined;
    if (!link) return;
    event.preventDefault();
    window.open(link.getAttribute("href") ?? "", "_blank", "noopener");
  };
  win.addEventListener("wheel", onFrameWheel, { passive: false });
  win.addEventListener("scroll", onScroll, { passive: true });
  doc.addEventListener("pointerdown", onEngage);
  doc.addEventListener("click", onClick, true);
  teardown.push(() => {
    win.removeEventListener("wheel", onFrameWheel);
    win.removeEventListener("scroll", onScroll);
    doc.removeEventListener("pointerdown", onEngage);
    doc.removeEventListener("click", onClick, true);
  });
  if (file) pick.attach();
}

watch(
  () => src,
  () => {
    isLoaded.value = false;
    isBroken.value = false;
    natural.value = 0;
  },
);

watch(zoom, () => {
  if (!isFramed.value) return;
  const el = scrollerOf();
  const at = el && positionOf(el);
  zoomFrame();
  if (at) follow(at);
});

watch(look.theme, (theme) => {
  if (kind === "markdown") frameDoc()?.documentElement.setAttribute("data-theme", theme);
});

onBeforeUnmount(unhook);

defineExpose({ follow });
</script>

<template>
  <div
    class="stage"
    data-region="preview-stage"
    :data-kind="kind"
    :data-loaded="isLoaded"
    :style="OneDarkVivid.cssVars"
    @focusin="emit('engage')"
    @pointerdown="emit('engage')"
    @pointerenter="emit('engage')"
  >
    <iframe v-if="isFramed" ref="frame" class="frame" :src="src" :title="title" @load="onFrameLoad" />
    <div v-else ref="scroller" class="scroller" @scroll.passive="onScroll" @wheel="onWheel">
      <div class="sizer" :style="{ height: `${tall * zoom}px`, width: `${width * zoom}px` }">
        <div ref="content" class="content" :style="{ transform: `scale(${zoom})`, width: `${width}px` }">
          <img v-if="kind === 'image'" :alt="title" :src="src" @error="isBroken = true" @load="onMedia" />
          <video
            v-else-if="kind === 'video'"
            controls
            preload="metadata"
            :src="src"
            @error="isBroken = true"
            @loadedmetadata="onMedia"
          />
          <audio v-else controls preload="metadata" :src="src" @error="isBroken = true" @loadedmetadata="onMedia" />
        </div>
      </div>
    </div>
    <UiStateMessage v-if="isBroken" align="center" class="state">This file can't be drawn here.</UiStateMessage>
    <UiStateMessage v-else-if="!isLoaded" align="center" class="state" kind="loading">Rendering…</UiStateMessage>
  </div>
</template>

<style scoped>
.stage {
  background: var(--ed-bg);
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  min-width: 0;
  position: relative;
}

/* A page that paints no background of its own would show the editor's dark through it. */
.frame {
  background: #fff;
  border: 0;
  flex: 1;
  min-width: 0;
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
}

.scroller {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 20px;
  scrollbar-gutter: stable;
}

/* Auto margins centre the media while it fits and fall to zero once it overflows, so no edge is ever cut off. */
.sizer {
  flex: none;
  margin: auto;
}

.content {
  opacity: 0;
  transform-origin: 0 0;
  transition: opacity var(--duration-base) var(--ease-out);
}

.stage[data-loaded="true"] .frame,
.stage[data-loaded="true"] .content {
  opacity: 1;
}

/* A checkerboard behind an image, so its transparent parts read as transparent. */
.stage[data-kind="image"] .content {
  background: repeating-conic-gradient(var(--ed-button) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
}

img,
video,
audio {
  display: block;
  height: auto;
  width: 100%;
}

.state {
  --ink: var(--ed-ink);
  --muted: var(--ed-muted);
  --subtle: var(--ed-muted);
  inset: 0;
  pointer-events: none;
  position: absolute;
}

@media (prefers-reduced-motion: reduce) {
  .frame,
  .content {
    transition: none;
  }
}
</style>
