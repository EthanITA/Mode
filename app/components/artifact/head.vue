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
      variant="glass-liquid"
    >
      <span class="title">{{ title }}</span>
    </UiSurface>
  </div>
</template>

<style scoped>
/* The island row anchors this; shrinking is what keeps a long title off the cell
   to its right instead of running underneath it. */
.head {
  @apply flex min-w-0 flex-initial items-center gap-2;
}

.pill {
  @apply flex h-(--island-row-h) flex-none items-center gap-2.5 px-3.5 py-0;
}

.what {
  @apply min-w-0 flex-initial overflow-hidden;
}

.title {
  @apply min-w-0 truncate typo-heading font-extrabold text-fg;
}
</style>
