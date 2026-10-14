<script lang="ts" setup>
import { Eye, EyeOff, X } from "@lucide/vue";

const route = useRoute();
const chrome = useChrome();
const sc = useSidecar();
const islands = $islands();

const LABELS: Record<Face, string> = { artifacts: "Artifacts", files: "Files", history: "History", review: "Review" };

const artifact = $artifact();

// With the server down every route shows the reconnecting screen, which has nothing to switch.
const inSession = computed(() => !sc.failure.value && route.path.startsWith("/c/"));
// The faces belong to the conversation; an artifact on its own, routed or grown over the face, has nothing to switch.
const onArtifact = computed(() => inSession.value && (!!route.params.slug || artifact.isFull));
const onFaces = computed(() => inSession.value && !onArtifact.value);

const faces = computed(() => chrome.view.faces.value.map((face) => ({ label: LABELS[face], value: face })));

const face = computed({
  get: () => chrome.view.current.value,
  set: (next: Face) => chrome.view.set(next),
});

// Hiding the islands belongs to a grown page, so shrinking it brings them back.
watch(
  () => artifact.isFull,
  (full) => {
    if (!full) islands.isHidden = false;
  },
);

// A routed page is replaced on close so Back never walks through it; a grown one just shrinks back.
function closePage(): void {
  if (artifact.isFull) artifact.isFull = false;
  else void navigateTo(`/c/${String(route.params.key ?? "")}`, { replace: true });
}
</script>

<template>
  <div class="top-right" data-region="top-right" :data-bare="islands.isHidden">
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
    <span v-if="artifact.isFull" class="corner" data-region="islands-toggle">
      <span class="slide">
        <ChromeAction
          :icon="islands.isHidden ? Eye : EyeOff"
          shape="island"
          :tip="islands.isHidden ? 'Show the islands' : 'Hide the islands'"
          @click="islands.isHidden = !islands.isHidden"
        />
      </span>
    </span>
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

.top-right > :not(.corner) {
  transition: opacity var(--duration-base) var(--ease-out);
}

.top-right[data-bare="true"] > :not(.corner) {
  opacity: 0;
  pointer-events: none;
}

/* The padding is the hover zone that reaches the shell's corner, so the hidden toggle is found by pointing there. */
.corner {
  display: flex;
  margin: calc(var(--gutter) * -1) calc(var(--gutter) * -1) calc(var(--gutter) * -1) 0;
  padding: var(--gutter) var(--gutter) var(--gutter) 0;
}

.slide {
  display: flex;
  transition: transform var(--duration-base) var(--ease-out);
}

/* Keyboard focus holds it out, but the focus a click leaves behind must not, or it never slides away. */
.top-right[data-bare="true"] .corner:not(:hover, :has(:focus-visible)) .slide {
  transform: translate(calc(100% + var(--gutter)), calc(-100% - var(--gutter)));
}

/* The pill is the surface, so the segmented must not draw a second one. */
.pill :deep(.segmented) {
  background: none;
  border: 0;
}
</style>
