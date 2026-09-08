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
      <UiSegmented
        v-if="faces.length > 1"
        v-model="face"
        data-region="view-switcher"
        :options="faces"
      />

      <!-- Bare: the chip already draws a background, so a surface behind it read as two. -->
      <UiChip
        class="comment"
        data-region="comment-arm"
        :selected="chrome.comment.armed.value"
        title="Comment on anything · hold C"
        @click="toggleComment"
      >
        <UiIcon :icon="MessageSquare" size="sm" />
        Comment
      </UiChip>
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

/* Sits in the row on its own height rather than being padded out to the row's. */
.comment {
  flex: none;
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
