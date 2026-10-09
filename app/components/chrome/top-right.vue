<script lang="ts" setup>
import { X } from "@lucide/vue";

const route = useRoute();
const chrome = useChrome();

const LABELS: Record<Face, string> = { files: "Files", history: "History", review: "Review" };

const isFull = useArtifactFullscreen();

const inSession = computed(() => route.path.startsWith("/c/"));
// The faces belong to the conversation; an artifact on its own, routed or grown over the face, has nothing to switch.
const onArtifact = computed(() => inSession.value && (!!route.params.slug || isFull.value));
const onFaces = computed(() => inSession.value && !onArtifact.value);

const faces = computed(() => chrome.view.faces.value.map((face) => ({ label: LABELS[face], value: face })));

const face = computed({
  get: () => chrome.view.current.value,
  set: (next: Face) => chrome.view.set(next),
});

// A routed page is replaced on close so Back never walks through it; a grown one just shrinks back.
function closePage(): void {
  if (isFull.value) isFull.value = false;
  else void navigateTo(`/c/${String(route.params.key ?? "")}`, { replace: true });
}
</script>

<template>
  <div class="top-right" data-region="top-right">
    <UiSurface
      v-if="onFaces && faces.length > 1"
      v-island-pop="'top right'"
      class="pill"
      pad="none"
      shape="pill"
      variant="glass-liquid"
    >
      <UiSegmented v-model="face" data-region="view-switcher" :options="faces" />
    </UiSurface>

    <template v-if="onArtifact">
      <ChromeCommentToggle shape="island" />
      <ArtifactThemeToggle shape="island" />
      <ChromeAction data-region="artifact-close" :icon="X" shape="island" tip="Close the page" @click="closePage" />
    </template>
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

/* The pill is the surface, so the segmented must not draw a second one. */
.pill :deep(.segmented) {
  background: none;
  border: 0;
}
</style>
