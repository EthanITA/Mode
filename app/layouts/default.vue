<script lang="ts" setup>
import { useResizeObserver } from "@vueuse/core";

const sc = useSidecar();

const dockEl = useTemplateRef<HTMLElement>("dockEl");
const dockHeight = ref(0);

// Published so a panelled face can reserve exactly what the dock covers: expanding the
// transcript then lifts the reading surface instead of burying its last line.
useResizeObserver(dockEl, ([entry]) => {
  dockHeight.value = Math.round(entry?.contentRect.height ?? 0);
});
</script>

<template>
  <div class="shell" :style="{ '--dock-h': `${dockHeight}px` }">
    <slot />

    <!-- One row, and every cell is a flex sibling in it. Two independently anchored
         layers on the same edge is what let the title run under the switcher. -->
    <div class="row" data-region="island-row">
      <slot name="lead" />
      <span class="spacer" />
      <ChromeTopRight />
    </div>

    <div ref="dockEl" class="corner corner-start" data-region="dock-corner">
      <p v-if="sc.failure.value" class="failure" role="alert">
        The sidecar server did not answer: {{ sc.failure.value }}
      </p>

      <slot name="dock" />
    </div>

    <div class="corner corner-end" data-region="board-corner">
      <slot name="board" />
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
  align-items: flex-start;
  display: flex;
  gap: 8px;
  left: var(--gutter);
  pointer-events: none;
  position: absolute;
  right: var(--gutter);
  top: var(--gutter);
  z-index: 30;
}

.corner {
  bottom: var(--gutter);
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  position: absolute;
  z-index: 20;
}

/* Each corner hugs its own edge and neither spans the width, so the dock and the
   board cannot reach each other however tall either grows. */
.corner-start {
  align-items: flex-start;
  left: var(--gutter);
}

.corner-end {
  align-items: flex-end;
  right: var(--gutter);
}

.row > :deep(*),
.corner > :deep(*) {
  pointer-events: auto;
}

/* Outranks the rule above on its own, rather than on source order: the row spans
   the full width, so a spacer that took clicks would deaden a strip of the canvas. */
.row > .spacer {
  flex: 1;
  pointer-events: none;
}

.failure {
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-field);
  color: var(--error);
  font-size: 13px;
  margin: 0;
  padding: 9px 13px;
}
</style>
