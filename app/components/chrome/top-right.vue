<script lang="ts" setup>
import { X } from "@lucide/vue";

const route = useRoute();
const chrome = useChrome();

const LABELS: Record<Face, string> = { files: "Files", history: "History", review: "Review" };

const inSession = computed(() => route.path.startsWith("/c/"));
// The faces belong to the conversation; an artifact has its own page and nothing to switch between.
const onFaces = computed(() => inSession.value && !route.params.slug);
// Comment and theme act on an artifact, so they are islands only on its opened page and pills in the Files preview.
const onArtifact = computed(() => inSession.value && !!route.params.slug);

const faces = computed(() => chrome.view.faces.value.map((face) => ({ label: LABELS[face], value: face })));

const face = computed({
  get: () => chrome.view.current.value,
  set: (next: Face) => chrome.view.set(next),
});

// Replaced, as Fullscreen pushed nothing either, so Back never walks through pages opened and closed.
function closePage(): void {
  void navigateTo(`/c/${String(route.params.key ?? "")}`, { replace: true });
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
      variant="glass"
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
