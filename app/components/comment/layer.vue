<script lang="ts" setup>
import { EASE_CSS, MOTION_DURATION, prefersReducedMotion } from "@cela/design/utils/motion";
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
const notesEl = useTemplateRef<HTMLElement>("notesEl");

// The sheet on a face is too narrow for a second column; a routed page or a grown sheet has the room.
const isRoomy = computed(() => artifact.isFull || !!route.params.slug);
const hasNotes = computed(() => (!!page || isRoomy.value) && ready);
const canAsk = computed(() => hasNotes.value && live);
const place = computed<NotesPlace>(() => {
  if (!page) return "over";
  return artifact.isFull ? "float" : "dock";
});

// Faded in where they land rather than remounted, so an open draft survives the sheet growing or shrinking.
watch(place, async () => {
  await nextTick();
  if (prefersReducedMotion()) return;
  notesEl.value?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: MOTION_DURATION.moderate,
    easing: EASE_CSS.out,
  });
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
    <aside v-if="hasNotes" ref="notesEl" class="notes" data-region="gutter">
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
  @apply relative grid grid-cols-1;
}

.surface,
.notes {
  @apply col-start-1 row-start-1;
}

.surface {
  @apply min-w-0;
}

.notes {
  @apply pointer-events-none me-(--gutter) w-(--notes-w) justify-self-end;
}

.layer[data-place="float"] .notes {
  @apply me-0 w-auto justify-self-stretch;
}

/* Beside the site rather than over it, since a live page cannot be told to pad itself clear of a column. */
.layer[data-place="dock"] {
  @apply grid-cols-[minmax(0,1fr)_auto];
}

.layer[data-place="dock"] .notes {
  @apply relative col-start-2 row-start-1 m-0 w-78 border-l border-l-border bg-canvas px-4 py-0;
}

.layer[data-place="dock"][data-noted="false"] .notes {
  @apply hidden;
}

.heading {
  @apply absolute top-3.5 right-4 left-4 flex gap-2 text-subtle;
}

.where {
  @apply min-w-0 flex-1 truncate;
}

.layer[data-scrolls="true"] {
  @apply min-h-0 flex-1 grid-rows-1 overflow-hidden;
}

.layer[data-scrolls="true"] .surface {
  @apply flex min-h-0;
}
</style>
