<script lang="ts" setup>
import { useElementSize } from "@vueuse/core";
import type { ComponentPublicInstance } from "vue";
import type { ReviewThread } from "~~/shared/types/artifact";
import type { TrayItem } from "~/composables/useTray";
import type { FrameAnchor, FrameMark, NotesPlace } from "~/types/frame";
import type { Pin } from "~/utils/anchors";

const {
  anchors = [],
  file,
  live = true,
  marks = [],
  notices = {},
  place = "over",
  side = "left",
  slug,
  threads,
} = defineProps<{
  anchors?: FrameAnchor[];
  file?: string;
  live?: boolean;
  marks?: FrameMark[];
  notices?: Record<string, string>;
  place?: NotesPlace;
  side?: "left" | "right";
  slug?: string;
  threads: ReviewThread[];
}>();

const emit = defineEmits<{ reload: []; notes: [count: number] }>();

const CLEAR = 8;
const TETHER = 56;
const LINE = 12;

const sc = useSidecar();
const tray = useTray();
const sides = $sideQuestion();
const root = useTemplateRef<ComponentPublicInstance>("root");
const { width } = useElementSize(root);

const placed = computed(() => anchorThreads({ anchors, marks, threads }));

// A file outside the catalogue has no slug, so its notes are told apart by the file alone.
function isGutterNote(item: TrayItem): boolean {
  if (item.kind !== "comment") return false;
  if (!item.mark && !item.block && !item.quote) return false;
  if (item.file && file && item.file !== file) return false;
  return slug ? !item.source || item.source === slug : !!file && item.file === file;
}

function markOf(item: Pick<TrayItem, "block" | "mark" | "quote">): FrameMark | undefined {
  return (
    marks.find((mark) => item.mark && mark.key === item.mark && (!item.block || mark.text === item.block)) ??
    marks.find((mark) => item.block && mark.text === item.block) ??
    marks.find((mark) => item.quote && mark.text.includes(item.quote))
  );
}

const resolvedIds = computed(
  () => new Set(threads.filter((thread) => thread.status === "resolved").map((thread) => thread.id)),
);

const placedNotes = computed(() => {
  const pins = placed.value.pins;
  return tray.items.value
    .filter((item) => isGutterNote(item) && !resolvedIds.value.has(item.thread ?? ""))
    .map((item) => {
      const mark = markOf(item);
      const raw = mark?.top ?? item.top ?? 0;
      const clash = pins.some((pin) => Math.abs(pin.top - raw) < 20);
      return { item, mark, top: clash ? raw + 28 : raw };
    });
});

const linked = computed(() => new Set(placedNotes.value.map((row) => row.item.thread).filter(Boolean)));

const asked = computed(() =>
  sides.at(sc.sessionKey.value, "artifact", slug ?? "").map((thread) => {
    const mark = markOf(thread.anchor);
    return { mark, thread, top: mark?.top ?? thread.anchor.top ?? 0 };
  }),
);

const pageCards = computed(() => {
  const used = linked.value;
  const out: { mark?: FrameMark; top: number; thread: (typeof threads)[number] }[] = [];
  for (const pin of placed.value.pins) {
    const mark = marks.find((one) => one.key === pin.key) ?? marks.find((one) => one.top === pin.top);
    for (const thread of pin.threads) {
      if (thread.status === "resolved" || used.has(thread.id)) continue;
      out.push({ mark, top: pin.top, thread });
    }
  }
  return out;
});

const isFloating = computed(() => place === "float");

function perchOf({ mark, top }: { mark?: FrameMark; top: number }): Record<string, string> {
  if (!isFloating.value || !mark) return { top: `${top}px` };
  const from = mark.left + mark.width + CLEAR;
  const left = Math.min(from + TETHER, width.value - tokenPx("--notes-w") - tokenPx("--gutter"));
  const line = mark.top + LINE;
  const at = Math.max(line - TETHER, Math.min(CLEAR, line - LINE));
  return {
    "--tether": `${Math.max(0, left - from)}px`,
    "--tether-y": `${line - at}px`,
    left: `${left}px`,
    top: `${at}px`,
  };
}

// Threads the rewrite left behind still have to be reachable, so they collect under one chip.
const adrift = computed<Pin | undefined>(() => {
  const loose = placed.value.orphans.filter((thread) => thread.status !== "resolved");
  if (!loose.length) return undefined;
  return {
    key: "adrift",
    label: "",
    resolved: false,
    state: "label",
    threads: loose,
    top: 0,
    weak: false,
  };
});

const away = computed(() => (side === "right" ? "left" : "right"));

// The page sizes its notes column off this, so an empty one costs no width at all.
watchEffect(() =>
  emit("notes", pageCards.value.length + placedNotes.value.length + asked.value.length + (adrift.value ? 1 : 0)),
);
</script>

<template>
  <TransitionGroup
    ref="root"
    tag="div"
    name="note"
    class="gutter"
    data-region="gutter-markers"
    :data-place="place"
    :data-side="side"
  >
    <div v-for="row in pageCards" :key="`thread:${row.thread.id}`" class="perch perch-note" :style="perchOf(row)">
      <span v-if="isFloating && row.mark" class="tether" aria-hidden="true" />
      <ArtifactNote
        :live="live"
        :notice="notices[row.thread.id]"
        :slug="slug ?? ''"
        :thread="row.thread"
        @reload="emit('reload')"
      />
    </div>

    <div v-if="adrift" key="adrift" class="perch perch-foot">
      <UiPopover :estimated-height="320" :placement="away" width="w-95">
        <template #trigger="{ open }">
          <button
            class="loose plain-button mono-meta focusable"
            type="button"
            :data-open="open ? '' : undefined"
            :title="`${plural(adrift.threads.length, 'note')} whose text is gone from this version`"
          >
            {{ adrift.threads.length }} adrift
          </button>
        </template>

        <template #default="{ close }">
          <ArtifactThread adrift :pin="adrift" :slug="slug ?? ''" @close="close" />
        </template>
      </UiPopover>
    </div>

    <div v-for="row in placedNotes" :key="`tray:${row.item.id}`" class="perch perch-note" :style="perchOf(row)">
      <span v-if="isFloating && row.mark" class="tether" aria-hidden="true" />
      <ArtifactNote
        :item="row.item"
        :live="live"
        :notice="row.item.thread && notices[row.item.thread]"
        :slug="slug ?? ''"
        :thread="threads.find((thread) => thread.id === row.item.thread)"
        @reload="emit('reload')"
      />
    </div>

    <div v-for="row in asked" :key="`ask:${row.thread.id}`" class="perch perch-ask" :style="perchOf(row)">
      <span v-if="isFloating && row.mark" class="tether" aria-hidden="true" />
      <SideQuestionCard source="prose" :thread="row.thread" />
    </div>
  </TransitionGroup>
</template>

<style scoped>
/* Laid over the page's inline end, whose content the frame pads clear, so between notes the page stays reachable. */
.gutter {
  @apply pointer-events-none relative h-full overflow-visible;
}

.perch {
  @apply pointer-events-auto absolute right-0 left-0;
}

.perch-foot {
  @apply bottom-4;
}

.gutter[data-place="float"] .perch {
  @apply right-auto w-(--notes-w);
}

.gutter[data-place="float"] .perch-foot {
  @apply right-(--gutter) left-auto w-auto;
}

.tether {
  @apply absolute top-(--tether-y) right-full h-0.5 w-(--tether) -translate-y-px rounded-full bg-primary;
}

.perch-note {
  @apply z-4;
}

.perch-ask {
  @apply z-5;
}

/* A saved note lands beside its line; perches are absolute, so a leaving one shifts nothing. */
.note-enter-active {
  @apply transition duration-(--duration-snappy) ease-out;
}

.note-enter-from {
  @apply translate-y-2 opacity-0;
}

.note-leave-active {
  @apply transition duration-(--duration-fast) ease-out;
}

.note-leave-to {
  @apply scale-96 opacity-0;
}

.loose {
  @apply rounded-selector border border-dashed border-border-strong bg-raised px-2 py-1 whitespace-nowrap text-muted;
}

.loose[data-open] {
  @apply border-primary text-primary;
}
</style>
