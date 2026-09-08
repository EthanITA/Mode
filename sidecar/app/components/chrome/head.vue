<script lang="ts" setup>
import { ArrowLeft } from "@lucide/vue";

const { cwd, title } = defineProps<{ cwd?: string; title: string }>();

const chrome = useChrome();

const zoom = computed(() => {
  const at = chrome.canvas.zoom.value;
  return at ? `${Math.round(at * 100)}%` : undefined;
});
</script>

<template>
  <div class="head" data-region="conversation-head">
    <UiSurface class="pill" pad="none" shape="pill" variant="glass">
      <NuxtLink v-press class="back focusable" to="/">
        <UiIcon :icon="ArrowLeft" size="sm" />
        desk
      </NuxtLink>
    </UiSurface>

    <UiSurface class="pill what" data-region="conversation-title" pad="none" shape="pill" variant="glass">
      <span class="title">{{ title }}</span>
      <span v-if="cwd" class="cwd mono-meta">{{ homePath(cwd) }}</span>
    </UiSurface>

    <UiSurface v-if="zoom" class="pill" data-region="canvas-zoom" pad="none" shape="pill" variant="glass">
      <button
        v-press
        class="zoom focusable plain-button"
        type="button"
        title="Zoom to fit · ⇧1"
        @click="chrome.canvas.fit.value?.()"
      >
        {{ zoom }}
      </button>
    </UiSurface>
  </div>
</template>

<style scoped>
/* The island row anchors this; shrinking is what keeps a long title off the cell
   to its right instead of running underneath it. */
.head {
  align-items: center;
  display: flex;
  flex: 0 1 auto;
  gap: 8px;
  min-width: 0;
}

.pill {
  align-items: center;
  display: flex;
  flex: none;
  gap: 10px;
  height: var(--island-row-h);
  padding: 0 14px;
}

.what {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
}

.back {
  align-items: center;
  color: var(--ink);
  display: inline-flex;
  font-size: 12.5px;
  font-weight: 600;
  gap: 8px;
  text-decoration: none;
}

.back:hover {
  color: var(--primary);
}

.title {
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.02em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cwd {
  color: var(--muted);
  flex: none;
  text-transform: none;
  white-space: nowrap;
}

.zoom {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
}

.zoom:hover {
  color: var(--ink);
}
</style>
