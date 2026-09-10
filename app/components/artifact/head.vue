<script lang="ts" setup>
import { ArrowLeft } from "@lucide/vue";

const { conversation, title } = defineProps<{ conversation: string; title: string }>();

const sc = useSidecar();

const session = computed(() => sc.sessions.value.find((s) => s.key === conversation));
</script>

<template>
  <div class="head" data-region="artifact-head">
    <UiSurface class="pill" pad="none" shape="pill" variant="glass">
      <NuxtLink
        v-press
        class="back focusable"
        :aria-label="`Back to ${session ? nameOf(session) : 'the conversation'}`"
        :title="session ? nameOf(session) : 'conversation'"
        :to="`/c/${conversation}`"
      >
        <UiIcon :icon="ArrowLeft" size="sm" />
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

/* Square, so an icon-only pill reads as a button rather than as a clipped label. */
.pill:has(> .back) {
  justify-content: center;
  padding: 0;
  width: var(--island-row-h);
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
  justify-content: center;
  height: 100%;
  text-decoration: none;
  width: 100%;
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
