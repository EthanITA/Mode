<script lang="ts" setup>
import { X } from "@lucide/vue";

const route = useRoute();
const chrome = useChrome();
const sc = useSidecar();

const LABELS: Record<Face, string> = { artifacts: "Artifacts", files: "Files", history: "History", review: "Review" };

// With the server down every route shows the reconnecting screen, which has nothing to switch.
const inSession = computed(() => !sc.failure.value && route.path.startsWith("/c/"));
// A routed artifact has no faces to switch; a grown one keeps the row as it was, so the row fades out and back unchanged.
const onArtifact = computed(() => inSession.value && !!route.params.slug);
const onFaces = computed(() => inSession.value && !onArtifact.value);

const faces = computed(() => chrome.view.faces.value.map((face) => ({ label: LABELS[face], value: face })));

const face = computed({
  get: () => chrome.view.current.value,
  set: (next: Face) => chrome.view.set(next),
});

// Replaced on close so Back never walks through it.
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
      variant="glass-liquid"
    >
      <UiSegmented v-model="face" data-region="view-switcher" :options="faces" />
    </UiSurface>

    <ChromeCommentToggle v-if="onArtifact" shape="island" />
    <ChromeThemeToggle />
    <ChromeAction
      v-if="onArtifact"
      data-region="artifact-close"
      :icon="X"
      shape="island"
      tip="Close the page"
      @click="closePage"
    />
  </div>
</template>

<style scoped>
.top-right {
  @apply flex flex-none items-center gap-2;
}

.pill {
  @apply island-row px-1.5;
}

/* The pill is the surface, so the segmented must not draw a second one. */
.pill :deep(.segmented) {
  @apply border-0 bg-transparent bg-none;
}
</style>
