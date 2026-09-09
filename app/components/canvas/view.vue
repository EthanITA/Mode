<script lang="ts" setup>
import { Canvas, ContextMenu, type CanvasFitOptions, type CanvasMenuEvent } from "@cela/design";
import { LayoutGrid, Maximize2, MousePointerSquareDashed, Scan, StickyNote } from "@lucide/vue";
import { CARD_H, CARD_W, NOTE_H, NOTE_W, type CardView } from "~/composables/useCanvas";
import type { CardAction } from "~/types/canvas-action";

const emit = defineEmits<{ open: [slug: string] }>();

const sc = useSidecar();
const bridge = useActionBridge();
const chrome = useChrome();
const {
  addNote,
  approve,
  approved,
  cards,
  empty,
  frames,
  links,
  loaded,
  moveCard,
  notes,
  removeNote,
  resizeCard,
  selection,
  setNote,
  toggleFrame,
  viewport,
  viewports,
} = useCanvas();

const canvasEl = useTemplateRef<InstanceType<typeof Canvas>>("canvasEl");
const menuEl = useTemplateRef<InstanceType<typeof ContextMenu>>("menuEl");
const menu = ref<CanvasMenuEvent>();

const shut = computed(() => new Set(frames.value.filter((frame) => !frame.open).map((frame) => frame.id)));
const shown = computed(() => cards.value.filter((card) => !card.frame || !shut.value.has(card.frame)));

const target = computed(() => cards.value.find((card) => card.slug === menu.value?.targetId));

const acting = ref<string[]>([]);

/* Every card here came from /api/artifacts, so it is an artifact rather than a loose
   file, and Approve is the action that means something. Extension mapping would say
   Publish for all of them, which pushes a page to claude.ai — never a default. */
function actionOf(card: CardView): CardAction {
  return {
    done: approved.value.includes(card.slug) ? SPEC_ACTION.done : undefined,
    hint: SPEC_ACTION.hint,
    label: SPEC_ACTION.label,
    pending: acting.value.includes(card.slug),
    title: SPEC_ACTION.title,
    tone: SPEC_ACTION.tone,
  };
}

async function act(card: CardView): Promise<void> {
  if (acting.value.includes(card.slug) || approved.value.includes(card.slug)) return;
  acting.value = [...acting.value, card.slug];
  try {
    const outcome = await bridge.perform(SPEC_ACTION, { file: card.file, slug: card.slug });
    if (outcome.delivered) approve(card.slug);
    chrome.toast(outcome.toast, outcome.delivered ? "success" : "destructive");
  } finally {
    acting.value = acting.value.filter((slug) => slug !== card.slug);
  }
}

function open(slug: string): void {
  sc.slug.value = slug;
  chrome.view.set("read");
  emit("open", slug);
}

function onMenu(event: CanvasMenuEvent): void {
  menu.value = event;
  menuEl.value?.openAt(event.clientX, event.clientY);
}

/* A press on a card bubbles here too, and the card owns its own double-click. */
function onDoubleClick(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest(".canvas-item")) return;
  const at = canvasEl.value?.planePoint(event.clientX, event.clientY);
  if (at) addNote(at);
}

function noteHere(close: () => void): void {
  if (menu.value) addNote(menu.value.plane);
  close();
}

// The islands float over the plane, so a fit that ignores them parks content underneath.
function fit(options?: CanvasFitOptions): void {
  canvasEl.value?.zoomToFit(options ?? { inset: chrome.frame.insets.value });
}

function step(factor: number): void {
  canvasEl.value?.zoomStep(factor);
}

function reset(): void {
  canvasEl.value?.zoomReset();
}

// The island row reads the zoom through this, so it shows nothing once the canvas unmounts.
chrome.canvas.register({ fit, reset, step, zoom: () => viewport.value.zoom });

// The fit waits for the first card to mount, because an empty canvas has nothing to fit.
watch(
  [loaded, () => cards.value.length],
  async ([here, count]) => {
    if (!here || count <= 0 || here !== sc.sessionKey.value || viewports.value[here]) return;
    await nextTick();
    if (here !== sc.sessionKey.value || viewports.value[here]) return;
    viewports.value = { ...viewports.value, [here]: { x: 0, y: 0, zoom: 1 } };
    fit();
  },
  { immediate: true },
);
</script>

<template>
  <div class="canvas-view" data-region="canvas">
    <UiCanvas
      ref="canvasEl"
      v-model:selection="selection"
      v-model:viewport="viewport"
      :zoom-control="false"
      @dblclick="onDoubleClick"
      @menu="onMenu"
    >
      <svg aria-hidden="true" class="canvas-links">
        <g v-for="link in links" :key="link.id">
          <path :d="link.d" />
          <circle :cx="link.x" :cy="link.y" r="3" />
        </g>
      </svg>

      <CanvasFrame
        v-for="frame in frames"
        :key="frame.id"
        :frame="frame"
        @toggle="toggleFrame(frame.id)"
      />

      <UiCanvasItem
        v-for="card in shown"
        :id="card.slug"
        :key="card.slug"
        :position="card.placement"
        :style="{ height: `${CARD_H}px` }"
        :width="card.placement.width ?? CARD_W"
        @dblclick="open(card.slug)"
        @update:position="moveCard(card.slug, $event)"
        @update:width="resizeCard(card.slug, $event)"
      >
        <CanvasCard :action="actionOf(card)" :card="card" @act="act(card)" @open="open(card.slug)" />
      </UiCanvasItem>

      <UiCanvasItem
        v-for="note in notes"
        :id="note.id"
        :key="note.id"
        :position="note"
        :style="{ height: `${NOTE_H}px` }"
        :width="note.width ?? NOTE_W"
        class="canvas-note"
        @update:position="setNote(note.id, $event)"
        @update:width="setNote(note.id, { width: $event })"
      >
        <CanvasSticky
          :note="note"
          @remove="removeNote(note.id)"
          @text="setNote(note.id, { text: $event })"
        />
      </UiCanvasItem>
    </UiCanvas>

    <p v-if="empty" class="canvas-empty" data-region="canvas-empty">
      no artifacts yet · code stays in the editor<br />
      double-click to leave a note for Claude
    </p>

    <UiContextMenu ref="menuEl" data-region="canvas-menu" label="Canvas" width="w-64">
      <template #default="{ close }">
        <p class="mono-meta canvas-menu-head">{{ target?.title ?? "this spot on the plane" }}</p>
        <UiMenuItem v-if="target" :icon="Maximize2" @click="open(target.slug); close()">
          Open
        </UiMenuItem>
        <UiMenuItem :icon="StickyNote" @click="noteHere(close)">Leave a note</UiMenuItem>
        <UiMenuItem :icon="LayoutGrid" @click="canvasEl?.organize(); close()">Tidy up</UiMenuItem>
        <UiMenuItem :icon="Scan" @click="fit(); close()">Fit to view</UiMenuItem>
        <UiMenuItem :icon="MousePointerSquareDashed" @click="canvasEl?.selectAll(); close()">
          Select all
        </UiMenuItem>
      </template>
    </UiContextMenu>
  </div>
</template>

<style scoped>
.canvas-view {
  height: 100%;
  position: relative;
  width: 100%;
}

/* One pixel anchored at the plane origin: the paths overflow it, so the links layer
   never enters the canvas's own content-bounds measurement as a giant box. */
.canvas-links {
  height: 1px;
  left: 0;
  overflow: visible;
  pointer-events: none;
  position: absolute;
  top: 0;
  width: 1px;
}

.canvas-links path {
  fill: none;
  stroke: var(--border-strong);
  stroke-dasharray: 5 5;
  stroke-width: 1.5;
}

.canvas-links circle {
  fill: var(--border-strong);
}

.canvas-note {
  background: var(--warning-soft);
}

.canvas-empty {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 12px;
  left: 50%;
  line-height: 1.8;
  pointer-events: none;
  position: absolute;
  text-align: center;
  top: 45%;
  transform: translate(-50%, -50%);
}

.canvas-menu-head {
  color: var(--subtle);
  overflow: hidden;
  padding: 6px 10px 4px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
