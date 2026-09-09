<script lang="ts" setup>
import { ArrowLeft } from "@lucide/vue";

const { conversation, title } = defineProps<{ conversation: string; title: string }>();

const sc = useSidecar();

const session = computed(() => sc.sessions.value.find((s) => s.key === conversation));
</script>

<template>
  <div class="head" data-region="artifact-head">
    <UiSurface class="pill" pad="none" shape="pill" variant="glass">
      <NuxtLink v-press class="back focusable" :to="`/c/${conversation}`">
        <UiIcon :icon="ArrowLeft" size="sm" />
        {{ session ? nameOf(session) : "conversation" }}
      </NuxtLink>
    </UiSurface>

    <UiSurface class="pill what" data-region="artifact-title" pad="none" shape="pill" variant="glass">
      <span class="title">{{ title }}</span>
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
  max-width: 220px;
  overflow: hidden;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
