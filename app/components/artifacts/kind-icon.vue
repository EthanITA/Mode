<script lang="ts" setup>
import type { WebPage } from "~~/lib/web/page/protocol";
import type { ArtifactMeta } from "~~/shared/types/artifact";

const { meta, page } = defineProps<{
  meta: ArtifactMeta;
  /** The page on screen when this is the open entry, whose own icon wins for its site. */
  page?: WebPage;
}>();
</script>

<template>
  <span v-if="meta.kind === 'web'" class="kind" data-tip="Web">
    <WebFavicon class="site" :address="meta.url ?? ''" :page="page" />
  </span>
  <span v-else-if="meta.format === 'md'" class="kind" data-tip="Markdown">
    <svg aria-label="Markdown" class="mark" data-mark="md" role="img" viewBox="0 0 16 16">
      <path d="M1.5 11.5v-7l3 3.5 3-3.5v7" />
      <path d="M12 4.5v7" />
      <path d="m9.75 9.25 2.25 2.25 2.25-2.25" />
    </svg>
  </span>
  <span v-else class="kind" data-tip="HTML page">
    <svg aria-label="HTML" class="mark" data-mark="html" role="img" viewBox="0 0 16 16">
      <path d="M5.5 4 1.5 8l4 4" />
      <path d="m10.5 4 4 4-4 4" />
    </svg>
  </span>
</template>

<style scoped>
.kind {
  @apply inline-flex flex-none;
}

.site {
  @apply text-muted;
}

.mark {
  @apply size-3.5 flex-none fill-none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mark[data-mark="md"] {
  @apply stroke-(--file-md) stroke-[1.6];
}

.mark[data-mark="html"] {
  @apply stroke-(--file-html) stroke-[1.8];
}
</style>
