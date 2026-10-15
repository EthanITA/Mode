<script lang="ts" setup>
import { useResizeObserver } from "@vueuse/core";

const sc = useSidecar();
const chrome = useChrome();
const route = useRoute();
const artifact = $artifact();

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
  <div class="shell" :data-full="artifact.isFull" :style="dockHeight ? { '--dock-h': `${dockHeight}px` } : undefined">
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
  @apply relative mx-auto my-0 h-screen max-w-(--shell-max-w) overflow-hidden bg-canvas;
}

.row {
  @apply pointer-events-none absolute top-(--gutter) right-(--gutter) left-(--gutter) z-30 flex items-center gap-2;
}

.foot {
  @apply pointer-events-none absolute right-(--gutter) bottom-(--gutter) left-(--gutter) z-20 flex items-end gap-2;
}

.foot-dock {
  @apply flex min-w-0 flex-1 flex-col gap-2;
}

.foot-board {
  @apply flex-none;
}

.foot-board:not(:has(*)) {
  @apply hidden;
}

.row > :deep(*),
.foot-dock > :deep(*),
.foot-board > :deep(*) {
  @apply pointer-events-auto;
}

/* A grown sheet brings its own islands, and the notes wait in the dock until it shrinks back. */
.shell[data-full="true"] .row,
.shell[data-full="true"] .foot {
  @apply invisible;
}

/* Outranks the rule above on its own, rather than on source order: the row spans
   the full width, so a spacer that took clicks would deaden a strip of the canvas. */
.row > .spacer {
  @apply pointer-events-none flex-1;
}

.page {
  @apply contents;
}

/* Over the page and the dock, under the island row so the theme toggle stays. */
.down {
  @apply z-25 bg-canvas;
}
</style>
