<script lang="ts" setup>
const route = useRoute();
const sc = useSidecar();
const chrome = useChrome();

const key = computed(() => String(route.params.key ?? ""));
const slug = computed(() => String(route.params.slug ?? ""));
const title = computed(() => sc.artifact.value?.title || deslug(slug.value));

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

    <template #board>
      <BoardIsland />
    </template>

    <main class="stage">
      <ArtifactReader :conversation="key" :slug="slug">
        <template #blank>
          <NuxtLink class="back focusable" :to="`/c/${key}`">Back to the conversation</NuxtLink>
        </template>
      </ArtifactReader>
    </main>
  </NuxtLayout>
</template>

<style scoped>
/* The page owns the scroll — the frame inside it is sized to its content and never scrolls itself. */
.stage {
  box-sizing: border-box;
  inset: 0;
  overflow-y: auto;
  padding: var(--stage-top) 0 calc(var(--dock-h, var(--dock-rest-h)) + var(--gutter) * 2);
  position: absolute;
}

.back {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--ink);
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  margin-top: 14px;
  padding: 6px 12px;
  text-decoration: none;
}

.back:hover {
  border-color: var(--ink);
}
</style>
