<script lang="ts" setup>
import { useResizeObserver } from "@vueuse/core";

const sc = useSidecar();
const chrome = useChrome();
const route = useRoute();

const dockEl = useTemplateRef<HTMLElement>("dockEl");
const boardEl = useTemplateRef<HTMLElement>("boardEl");
const dockHeight = ref(0);
const isDown = computed(() => !!sc.failure.value);

// A restarted server has forgotten what it followed, so the page waits on Listening for whatever is in front.
watch(isDown, (down) => {
  if (down && route.path !== "/") void navigateTo("/", { replace: true });
});
// Fetched while the server still answers, since a lazy page cannot load once it is down.
onMounted(() => void preloadRouteComponents("/"));

let queued = 0;
let sent = { dock: -1, board: -1 };

// rAF: dock and board are flex siblings, so a sync write re-notifies the other observer.
function publish(dock: number, board: number): void {
  if (dock === sent.dock && board === sent.board) return;
  sent = { dock, board };
  cancelAnimationFrame(queued);
  queued = requestAnimationFrame(() => {
    dockHeight.value = dock;
    chrome.frame.set({ dock, board });
  });
}

onScopeDispose(() => cancelAnimationFrame(queued));

useResizeObserver(dockEl, ([entry]) => {
  publish(Math.round(entry?.contentRect.height ?? 0), Math.round(boardEl.value?.getBoundingClientRect().width ?? 0));
});

useResizeObserver(boardEl, ([entry]) => {
  publish(Math.round(dockEl.value?.getBoundingClientRect().height ?? 0), Math.round(entry?.contentRect.width ?? 0));
});
</script>

<template>
  <!-- Unset until measured, so the first frame takes the CSS fallback rather than
       reserving nothing and shifting the reading surface once the observer reports. -->
  <div class="shell" :style="dockHeight ? { '--dock-h': `${dockHeight}px` } : undefined">
    <!-- Covered rather than unmounted, so Listening keeps its stream and opens what is in front once the server is back. -->
    <div class="page" :inert="isDown">
      <slot />
    </div>

    <ListeningScreen v-if="isDown" class="down" state="reconnecting" />

    <!-- One row, and every cell is a flex sibling in it. Two independently anchored
         layers on the same edge is what let the title run under the switcher. -->
    <div class="row" data-region="island-row">
      <slot v-if="!isDown" name="lead" />
      <span class="spacer" />
      <ChromeTopRight />
    </div>

    <!-- One row, so the composer takes whatever width the board leaves rather than
         the two hugging opposite corners and colliding in the middle. -->
    <div class="foot" data-region="dock-row">
      <div ref="boardEl" class="foot-board" data-region="board-corner">
        <slot name="board" />
      </div>

      <div ref="dockEl" class="foot-dock" data-region="dock-corner">
        <slot name="dock" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Bounded and centred, so on a wide display the islands hug the content column
   instead of flying out to the viewport corners. */
.shell {
  background: var(--canvas);
  height: 100vh;
  margin: 0 auto;
  max-width: var(--shell-max-w);
  overflow: hidden;
  position: relative;
}

.row {
  align-items: center;
  display: flex;
  gap: 8px;
  left: var(--gutter);
  pointer-events: none;
  position: absolute;
  right: var(--gutter);
  top: var(--gutter);
  z-index: 30;
}

.foot {
  align-items: flex-end;
  bottom: var(--gutter);
  display: flex;
  gap: 8px;
  left: var(--gutter);
  pointer-events: none;
  position: absolute;
  right: var(--gutter);
  z-index: 20;
}

.foot-dock {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.foot-board {
  flex: none;
}

.foot-board:not(:has(*)) {
  display: none;
}

.row > :deep(*),
.foot-dock > :deep(*),
.foot-board > :deep(*) {
  pointer-events: auto;
}

/* Outranks the rule above on its own, rather than on source order: the row spans
   the full width, so a spacer that took clicks would deaden a strip of the canvas. */
.row > .spacer {
  flex: 1;
  pointer-events: none;
}

.page {
  display: contents;
}

/* Over the page and the dock, under the island row so the theme toggle stays. */
.down {
  background: var(--canvas);
  z-index: 25;
}
</style>
