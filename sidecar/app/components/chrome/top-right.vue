<script lang="ts" setup>
const route = useRoute();
const chrome = useChrome();

const LABELS: Record<Face, string> = { canvas: "Canvas", history: "History", read: "Read" };

const atConversation = computed(() => route.path.startsWith("/c/"));

function toggleComment(): void {
  if (chrome.comment.armed.value) chrome.comment.disarm();
  else chrome.comment.arm();
}
</script>

<template>
  <div class="top-right">
    <template v-if="atConversation">
      <UiSurface
        v-if="chrome.view.faces.value.length > 1"
        class="pill switcher"
        pad="none"
        shape="pill"
        variant="glass"
      >
        <button
          v-for="face in chrome.view.faces.value"
          :key="face"
          class="face focusable plain-button"
          type="button"
          :data-on="chrome.view.current.value === face"
          @click="chrome.view.set(face)"
        >
          {{ LABELS[face] }}
        </button>
      </UiSurface>

      <UiSurface class="pill" pad="none" shape="pill" variant="glass">
        <button
          class="comment focusable plain-button"
          type="button"
          title="Comment on anything · hold C"
          :aria-pressed="chrome.comment.armed.value"
          :data-on="chrome.comment.armed.value"
          @click="toggleComment"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Comment
        </button>
      </UiSurface>
    </template>

    <UiSurface class="pill theme" pad="none" shape="pill" variant="glass">
      <UiThemeToggle />
    </UiSurface>
  </div>
</template>

<style scoped>
.top-right {
  align-items: center;
  display: flex;
  gap: 8px;
  position: fixed;
  right: 16px;
  top: 16px;
  z-index: 30;
}

.pill {
  align-items: center;
  display: flex;
  flex: none;
  height: 40px;
}

.switcher {
  gap: 2px;
  padding: 0 4px;
}

.face {
  border-radius: 999px;
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
  height: 32px;
  padding: 0 14px;
  transition:
    background var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.face:hover {
  background: var(--sunken);
}

.face[data-on="true"] {
  background: var(--ink);
  color: var(--canvas);
}

.comment {
  align-items: center;
  border-radius: 999px;
  color: var(--ink);
  display: inline-flex;
  font-size: 12.5px;
  font-weight: 600;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
}

.comment svg {
  fill: none;
  height: 14px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.2;
  width: 14px;
}

.comment[data-on="true"] {
  background: var(--primary);
  color: var(--primary-content);
}

.theme {
  justify-content: center;
  width: 40px;
}

/* The package pins it top right for a standalone artifact page; here it is one cell of a row. */
.theme :deep(.theme-toggle) {
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--ink);
  height: 40px;
  position: static;
  width: 40px;
}

@media (prefers-reduced-motion: reduce) {
  .face {
    transition: none;
  }
}
</style>
