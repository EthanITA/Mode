<script lang="ts" setup>
import { MessageSquare } from "@lucide/vue";

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
  <div class="top-right" data-region="top-right">
    <template v-if="atConversation">
      <UiSurface
        v-if="chrome.view.faces.value.length > 1"
        class="pill switcher"
        data-region="view-switcher"
        pad="none"
        shape="pill"
        variant="glass"
      >
        <UiChip
          v-for="face in chrome.view.faces.value"
          :key="face"
          :selected="chrome.view.current.value === face"
          @click="chrome.view.set(face)"
        >
          {{ LABELS[face] }}
        </UiChip>
      </UiSurface>

      <UiSurface class="pill" data-region="comment-arm" pad="none" shape="pill" variant="glass">
        <UiChip
          :selected="chrome.comment.armed.value"
          title="Comment on anything · hold C"
          @click="toggleComment"
        >
          <UiIcon :icon="MessageSquare" size="sm" />
          Comment
        </UiChip>
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
  padding: 0 6px;
}

.switcher {
  gap: 4px;
}

.theme {
  justify-content: center;
  padding: 0;
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
</style>
