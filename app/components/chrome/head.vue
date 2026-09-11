<script lang="ts" setup>
import { ArrowLeft } from "@lucide/vue";

const { cwd, title } = defineProps<{ cwd?: string; title: string }>();
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

</style>
