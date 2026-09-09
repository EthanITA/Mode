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

const emit = defineEmits<{ reload: [] }>();

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
</script>

<template>
  <div class="gutter" data-region="gutter-markers" :data-side="side">
    <div
      v-for="row in pageCards"
      :key="row.thread.id"
      class="perch perch-note"
      :style="{ top: `${row.top}px` }"
    >
      <ReadNote :live="live" :slug="sc.slug.value ?? ''" :thread="row.thread" @reload="emit('reload')" />
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
          <ReadThread adrift :pin="adrift" :slug="sc.slug.value ?? ''" @close="close" />
        </template>
      </UiPopover>
    </div>

    <div
      v-for="row in placedNotes"
      :key="row.item.id"
      class="perch perch-note"
      :style="{ top: `${row.top}px` }"
    >
      <ReadNote
        :item="row.item"
        :live="live"
        :slug="sc.slug.value ?? ''"
        @reload="emit('reload')"
      />
    </div>

    <p v-if="!pageCards.length && !adrift && !placedNotes.length" class="none mono-meta">
      {{ threads.length ? "no notes here" : "no notes" }}
    </p>
  </div>
</template>

<style scoped>
.gutter {
  bottom: 0;
  overflow: visible;
  position: absolute;
  top: 0;
  width: var(--gutter-w);
}

.gutter[data-side="left"] {
  left: calc(-1 * var(--gutter-w));
}

.gutter[data-side="right"] {
  right: calc(-1 * var(--gutter-w));
}

.perch {
  position: absolute;
  right: 8px;
}

.perch-foot {
  bottom: 16px;
}

.perch-note {
  width: 280px;
  z-index: 4;
}

/* An empty gutter with no words reads as broken, so it says so. */
.none {
  color: var(--subtle);
  margin: 0;
  position: absolute;
  right: 10px;
  top: 24px;
  transform: rotate(180deg);
  writing-mode: vertical-rl;
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
