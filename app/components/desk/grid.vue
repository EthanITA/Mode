<script lang="ts" setup>
import { Canvas, ContextMenu, type CanvasMenuEvent } from "@cela/design";
import { LayoutGrid, Maximize2, Scan, Trash2 } from "@lucide/vue";
import { CARD_H, CARD_W } from "~/composables/useCanvas";
import type { DeskCard } from "~/composables/useDesk";

const sc = useSidecar();
const chrome = useChrome();
const { cards } = useDeskCards();
const { move } = useDeskLayout();
loadDeskBoards();

const emit = defineEmits<{ open: [key: string]; remove: [card: DeskCard] }>();

const canvasEl = useTemplateRef<InstanceType<typeof Canvas>>("canvasEl");
const menuEl = useTemplateRef<InstanceType<typeof ContextMenu>>("menuEl");
const menu = ref<CanvasMenuEvent>();
const selection = ref<string[]>([]);
const viewport = useState("sc:desk-viewport", () => ({ x: 0, y: 0, zoom: 1 }));
// Reset on close: a menu that reopens still armed would delete on a single press.
const arming = ref<string>();

const target = computed(() => cards.value.find((card) => card.key === menu.value?.targetId));

function open(card: DeskCard): void {
  markDeskSeen(card.key, sc.sessions.value.find((one) => one.key === card.key)?.artifacts ?? []);
  emit("open", card.key);
}

function onMenu(event: CanvasMenuEvent): void {
  menu.value = event;
  arming.value = undefined;
  menuEl.value?.openAt(event.clientX, event.clientY);
}

function askRemove(card: DeskCard, close: () => void): void {
  if (arming.value !== card.key) {
    arming.value = card.key;
    return;
  }
  arming.value = undefined;
  close();
  emit("remove", card);
}

function fit(): void {
  canvasEl.value?.zoomToFit({ inset: chrome.frame.insets.value });
}

chrome.canvas.register({
  fit,
  reset: () => canvasEl.value?.zoomReset(),
  step: (factor: number) => canvasEl.value?.zoomStep(factor),
  zoom: () => viewport.value.zoom,
});
</script>

<template>
  <div class="desk" data-region="desk">
    <UiCanvas
      ref="canvasEl"
      v-model:selection="selection"
      v-model:viewport="viewport"
      :zoom-control="false"
      @menu="onMenu"
    >
      <UiCanvasItem
        v-for="card in cards"
        :id="card.key"
        :key="card.key"
        fixed
        :position="card.at"
        :style="{ height: `${CARD_H}px` }"
        :width="CARD_W"
        @dblclick="open(card)"
        @update:position="move(card.key, $event)"
      >
        <DeskCard :card="card" />
      </UiCanvasItem>
    </UiCanvas>

    <p v-if="!cards.length" class="empty">
      No conversation to show.<br />Turn the archive on to see the ones `claude agents` does not list.
    </p>

    <UiContextMenu ref="menuEl" data-region="desk-menu" label="Conversation" width="w-64">
      <template #default="{ close }">
        <p class="mono-meta menu-head">{{ target?.title ?? "the desk" }}</p>
        <template v-if="target">
          <UiMenuItem :icon="Maximize2" @click="open(target); close()">Open</UiMenuItem>
          <UiMenuItem :icon="Trash2" tone="destructive" @click="askRemove(target, close)">
            {{ arming === target.key ? "Press again to delete" : "Delete" }}
          </UiMenuItem>
        </template>
        <UiMenuItem :icon="LayoutGrid" @click="canvasEl?.organize(); close()">Tidy up</UiMenuItem>
        <UiMenuItem :icon="Scan" @click="fit(); close()">Fit to view</UiMenuItem>
      </template>
    </UiContextMenu>
  </div>
</template>

<style scoped>
.desk {
  height: 100%;
  position: relative;
  width: 100%;
}

.empty {
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

.menu-head {
  color: var(--subtle);
  overflow: hidden;
  padding: 6px 10px 4px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
