<script lang="ts" setup>
const { title } = defineProps<{ title: string }>();
</script>

<template>
  <div class="head" data-region="artifact-head">
    <UiSurface
      v-island-pop="'top left'"
      class="pill what"
      data-region="artifact-title"
      pad="none"
      shape="pill"
      variant="glass"
    >
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

.title {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.02em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
