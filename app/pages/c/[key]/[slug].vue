<script lang="ts" setup>
const route = useRoute();
const sc = useSidecar();
const chrome = useChrome();

const key = computed(() => String(route.params.key ?? ""));
const slug = computed(() => String(route.params.slug ?? ""));
const title = computed(() => sc.artifact.value?.title || deslug(slug.value));
const isWeb = computed(() => sc.artifact.value?.slug === slug.value && sc.artifact.value.kind === "web");

loadSidecar();

// `shelved` follows the conversation's face, and this route has no face to follow.
watchEffect(() => {
  chrome.islands.shelved.value = false;
});
</script>

<template>
  <NuxtLayout>
    <template #lead>
      <ArtifactHead :title="title" />
    </template>

    <template #dock>
      <ComposerNotes />
    </template>

    <main class="stage" :data-web="isWeb">
      <WebReader v-if="isWeb" :conversation="key" :slug="slug" />
      <ArtifactReader v-else :conversation="key" :slug="slug">
        <template #blank>
          <UiButton class="back" size="xs" :to="`/c/${key}`" variant="outline">Back to the conversation</UiButton>
        </template>
      </ArtifactReader>
    </main>
  </NuxtLayout>
</template>

<style scoped>
/* The page owns the scroll — the frame inside it is sized to its content and never scrolls itself. */
.stage {
  @apply absolute inset-0 overflow-y-auto px-0 pt-(--stage-top) pb-[calc(var(--dock-h,var(--dock-rest-h))_+_var(--gutter)_*_2)];
}

/* A live page scrolls itself, so the stage only holds it. */
.stage[data-web="true"] {
  @apply flex overflow-hidden;
}

.back {
  @apply mt-3.5;
}
</style>
