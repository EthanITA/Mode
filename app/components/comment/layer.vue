<script lang="ts" setup>
import type { FrameAnchor, FrameMark, NotesPlace } from "~/types/frame";
import type { ReviewThread } from "~~/shared/types/artifact";

const {
  anchors = [],
  file,
  live = true,
  marks = [],
  notices = {},
  page,
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
  /** A live site's page: its notes dock in a gutter headed by it, and float beside their blocks once grown. */
  page?: string;
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
const hasNotes = computed(() => (!!page || isRoomy.value) && ready);
const canAsk = computed(() => hasNotes.value && live);
const place = computed<NotesPlace>(() => {
  if (!page) return "over";
  return artifact.isFull ? "float" : "dock";
});

// The surface's document cannot read the app's tokens, so the room the notes hold reaches it in pixels.
const inset = computed(() =>
  hasNotes.value && place.value === "over" && noteCount.value > 0
    ? tokenPx("--notes-w") + tokenPx("--notes-gap") + tokenPx("--gutter")
    : 0,
);
</script>

<template>
  <div
    class="layer"
    data-region="comment-layer"
    :data-noted="noteCount > 0"
    :data-place="place"
    :data-scrolls="scrolls"
  >
    <div class="surface">
      <slot :can-ask="canAsk" :inset="inset" />
    </div>
    <aside v-if="hasNotes" class="notes" data-region="gutter">
      <div v-if="place === 'dock'" class="heading mono-meta">
        <span class="where">{{ page }}</span>
        <span>{{ plural(noteCount, "thread") }}</span>
      </div>
      <ArtifactGutter
        side="right"
        :anchors="anchors"
        :file="file"
        :live="live"
        :marks="marks"
        :notices="notices"
        :place="place"
        :slug="slug"
        :threads="threads"
        @notes="noteCount = $event"
        @reload="emit('reload')"
      />
    </aside>
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
  pointer-events: none;
  width: var(--notes-w);
}

.layer[data-place="float"] .notes {
  justify-self: stretch;
  margin-inline-end: 0;
  width: auto;
}

/* Beside the site rather than over it, since a live page cannot be told to pad itself clear of a column. */
.layer[data-place="dock"] {
  grid-template-columns: minmax(0, 1fr) auto;
}

.layer[data-place="dock"] .notes {
  background: var(--canvas);
  border-left: 1px solid var(--border);
  box-sizing: border-box;
  grid-area: 1 / 2;
  margin: 0;
  padding: 0 16px;
  position: relative;
  width: 312px;
}

.layer[data-place="dock"][data-noted="false"] .notes {
  display: none;
}

.heading {
  color: var(--subtle);
  display: flex;
  gap: 8px;
  left: 16px;
  position: absolute;
  right: 16px;
  top: 14px;
}

.where {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
