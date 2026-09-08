<script lang="ts" setup>
import { MessageSquare } from "@lucide/vue";

const route = useRoute();
const chrome = useChrome();

const LABELS: Record<Face, string> = { canvas: "Canvas", history: "History", read: "Read" };

const atConversation = computed(() => route.path.startsWith("/c/"));

const faces = computed(() => chrome.view.faces.value.map((face) => ({ label: LABELS[face], value: face })));

const face = computed({
  get: () => chrome.view.current.value,
  set: (next: Face) => chrome.view.set(next),
});

function toggleComment(): void {
  if (chrome.comment.armed.value) chrome.comment.disarm();
  else chrome.comment.arm();
}
</script>

<template>
  <div class="top-right" data-region="top-right">
    <template v-if="atConversation">
      <UiCanvasZoom
        v-if="chrome.view.current.value === 'canvas'"
        class="zoom"
        data-region="canvas-zoom"
        variant="glass-liquid"
        :zoom="chrome.canvas.zoom.value ?? 1"
        @step="chrome.canvas.step.value?.($event)"
        @reset="chrome.canvas.reset.value?.()"
      />

      <UiSurface v-if="faces.length > 1" class="pill" pad="none" shape="pill" variant="glass">
        <UiSegmented
          v-model="face"
          data-region="view-switcher"
          :options="faces"
        />
      </UiSurface>

      <UiSurface class="comment-cell" data-region="comment-arm" pad="none" shape="pill" variant="glass-liquid">
        <button
          type="button"
          class="plain-button focusable comment"
          :data-armed="chrome.comment.armed.value"
          title="Comment on anything · hold C"
          @click="toggleComment"
        >
          <UiIcon :icon="MessageSquare" size="sm" />
          Comment
        </button>
      </UiSurface>
    </template>

    <UiSurface class="pill theme" data-region="theme-toggle" pad="none" shape="pill" variant="glass">
      <UiThemeToggle />
    </UiSurface>
  </div>
</template>

<style scoped>
.top-right {
  align-items: center;
  display: flex;
  flex: none;
  gap: 8px;
}

.pill {
  align-items: center;
  display: flex;
  flex: none;
  height: var(--island-row-h);
  padding: 0 6px;
}

/* The pill is the surface, so the segmented must not draw a second one. */
.pill :deep(.segmented) {
  background: none;
  border: 0;
}

.zoom {
  align-items: center;
  display: flex;
  flex: none;
  height: var(--island-row-h);
  padding: 0 6px;
}

.comment-cell {
  align-items: center;
  display: flex;
  flex: none;
  height: var(--island-row-h);
  overflow: hidden;
}

.comment {
  align-items: center;
  background: transparent;
  border-radius: inherit;
  color: var(--ink);
  display: inline-flex;
  font-size: 12.5px;
  font-weight: 600;
  gap: 8px;
  height: 100%;
  padding: 0 14px;
}

.comment[data-armed="true"] {
  background: var(--primary);
  color: var(--primary-content);
}

.theme {
  justify-content: center;
  padding: 0;
  width: var(--island-row-h);
}

/* The package pins it top right for a standalone artifact page; here it is one cell of a row. */
.theme :deep(.theme-toggle) {
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--ink);
  height: var(--island-row-h);
  position: static;
  width: var(--island-row-h);
}
</style>
