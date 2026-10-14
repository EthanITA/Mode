<script lang="ts" setup>
import type { FrameAnchor, FrameMark } from "~/types/frame";
import type { ReviewThread } from "~~/shared/types/artifact";

const {
  anchors = [],
  file,
  live = true,
  marks = [],
  notices = {},
  ready = true,
  scrolls = false,
  slug,
  threads = [],
} = defineProps<{
  anchors?: FrameAnchor[];
  file?: string;
  live?: boolean;
  marks?: FrameMark[];
  notices?: Record<string, string>;
  ready?: boolean;
  /** The surface scrolls inside itself, so its marks are where blocks sit on screen and the notes clip to it. */
  scrolls?: boolean;
  slug?: string;
  threads?: ReviewThread[];
}>();

const emit = defineEmits<{ reload: [] }>();

const route = useRoute();
const artifact = $artifact();
const noteCount = ref(0);

// The sheet on a face is too narrow for a second column; a routed page or a grown sheet has the room.
const isRoomy = computed(() => artifact.isFull || !!route.params.slug);
const hasNotes = computed(() => isRoomy.value && ready);
const canAsk = computed(() => hasNotes.value && live);

function tokenPx(name: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
}

// The surface's document cannot read the app's tokens, so the room the notes hold reaches it in pixels.
const inset = computed(() =>
  hasNotes.value && noteCount.value > 0 ? tokenPx("--notes-w") + tokenPx("--notes-gap") + tokenPx("--gutter") : 0,
);
</script>

<template>
  <div class="layer" data-region="comment-layer" :data-scrolls="scrolls">
    <div class="surface">
      <slot :can-ask="canAsk" :inset="inset" />
    </div>
    <ArtifactGutter
      v-if="hasNotes"
      class="notes"
      side="right"
      :anchors="anchors"
      :file="file"
      :live="live"
      :marks="marks"
      :notices="notices"
      :slug="slug"
      :threads="threads"
      @notes="noteCount = $event"
      @reload="emit('reload')"
    />
  </div>
</template>

<style scoped>
/* The notes share the surface's cell and sit over its inline end, so the page's own ground runs under
   them and the surface pads its content clear of them instead of the whole page narrowing. */
.layer {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  position: relative;
}

.surface,
.notes {
  grid-area: 1 / 1;
}

.surface {
  min-width: 0;
}

.notes {
  justify-self: end;
  margin-inline-end: var(--gutter);
  width: var(--notes-w);
}

.layer[data-scrolls="true"] {
  flex: 1;
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.layer[data-scrolls="true"] .surface {
  display: flex;
  min-height: 0;
}
</style>
