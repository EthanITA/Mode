<script lang="ts" setup>
import type { ReviewThread } from "~~/shared/types/artifact";
import type { TrayItem } from "~/composables/useTray";
import type { FrameAnchor, FrameMark } from "~/types/frame";
import type { Pin } from "~/utils/anchors";

const {
  anchors = [],
  live = true,
  marks = [],
  side = "left",
  threads,
} = defineProps<{
  anchors?: FrameAnchor[];
  live?: boolean;
  marks?: FrameMark[];
  side?: "left" | "right";
  threads: ReviewThread[];
}>();

const emit = defineEmits<{ reload: []; notes: [count: number] }>();

const sc = useSidecar();
const tray = useTray();

const placed = computed(() => anchorThreads({ anchors, marks, threads }));

function isGutterNote(item: TrayItem): boolean {
  if (item.kind !== "comment") return false;
  if (!item.mark && !item.block && !item.quote) return false;
  if (item.file && sc.artifact.value?.path && item.file !== sc.artifact.value.path) return false;
  return !item.source || item.source === sc.slug.value;
}

function topOf(item: TrayItem): number {
  const exact = marks.find((mark) => item.mark && mark.key === item.mark && (!item.block || mark.text === item.block));
  if (exact) return exact.top;
  const byBlock = marks.find((mark) => item.block && mark.text === item.block);
  if (byBlock) return byBlock.top;
  const byQuote = marks.find((mark) => item.quote && mark.text.includes(item.quote));
  if (byQuote) return byQuote.top;
  return item.top ?? 0;
}

const placedNotes = computed(() => {
  const pins = placed.value.pins;
  return tray.items.value.filter(isGutterNote).map((item) => {
    const raw = topOf(item);
    const clash = pins.some((pin) => Math.abs(pin.top - raw) < 20);
    return { item, top: clash ? raw + 28 : raw };
  });
});

const linked = computed(() => new Set(placedNotes.value.map((row) => row.item.thread).filter(Boolean)));

const pageCards = computed(() => {
  const used = linked.value;
  const out: { top: number; thread: (typeof threads)[number] }[] = [];
  for (const pin of placed.value.pins) {
    for (const thread of pin.threads) {
      if (thread.status === "resolved" || used.has(thread.id)) continue;
      out.push({ top: pin.top, thread });
    }
  }
  return out;
});

// Threads the rewrite left behind still have to be reachable, so they collect under one chip.
const adrift = computed<Pin | undefined>(() => {
  const loose = placed.value.orphans;
  if (!loose.length) return undefined;
  return {
    key: "adrift",
    label: "",
    resolved: loose.every((thread) => thread.status === "resolved"),
    state: "label",
    threads: loose,
    top: 0,
    weak: false,
  };
});

const away = computed(() => (side === "right" ? "left" : "right"));

// The page sizes its notes column off this, so an empty one costs no width at all.
watchEffect(() => emit("notes", pageCards.value.length + placedNotes.value.length + (adrift.value ? 1 : 0)));
</script>

<template>
  <div class="gutter" data-region="gutter-markers" :data-side="side">
    <div
      v-for="row in pageCards"
      :key="row.thread.id"
      class="perch perch-note"
      :style="{ top: `${row.top}px` }"
    >
      <ArtifactNote :live="live" :slug="sc.slug.value ?? ''" :thread="row.thread" @reload="emit('reload')" />
    </div>

    <div v-if="adrift" class="perch perch-foot">
      <UiPopover :estimated-height="320" :placement="away" width="w-[380px]">
        <template #trigger="{ open }">
          <button
            class="loose focusable plain-button mono-meta"
            type="button"
            :data-open="open ? '' : undefined"
            :title="`${plural(adrift.threads.length, 'note')} whose text is gone from this version`"
          >
            {{ adrift.threads.length }} adrift
          </button>
        </template>

        <template #default="{ close }">
          <ArtifactThread adrift :pin="adrift" :slug="sc.slug.value ?? ''" @close="close" />
        </template>
      </UiPopover>
    </div>

    <div
      v-for="row in placedNotes"
      :key="row.item.id"
      class="perch perch-note"
      :style="{ top: `${row.top}px` }"
    >
      <ArtifactNote
        :item="row.item"
        :live="live"
        :slug="sc.slug.value ?? ''"
        @reload="emit('reload')"
      />
    </div>

  </div>
</template>

<style scoped>
/* A column of its own, never an overlay: a note pushes the page narrower instead of covering it. */
.gutter {
  height: 100%;
  overflow: visible;
  position: relative;
}

.perch {
  left: 0;
  position: absolute;
  right: 0;
}

.perch-foot {
  bottom: 16px;
}

.perch-note {
  z-index: 4;
}

.loose {
  background: var(--raised);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-selector);
  color: var(--muted);
  padding: 4px 8px;
  white-space: nowrap;
}

.loose[data-open] {
  border-color: var(--primary);
  color: var(--primary);
}

</style>
