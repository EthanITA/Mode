<script lang="ts" setup>
import type { BaselineOrigin, FileVersion } from "~~/shared/types/versions";

const {
  baseline,
  head,
  list,
  listed = true,
  reading = false,
  skipped,
  slug,
  unreachable = false,
} = defineProps<{
  baseline?: BaselineOrigin;
  head?: FileVersion;
  list: FileVersion[];
  listed?: boolean;
  reading?: boolean;
  skipped?: string;
  slug: string;
  unreachable?: boolean;
}>();

const at = defineModel<number>();

// Short labels for the strip only; the sentence and its tone come from the vocabulary History shares.
const BASELINE_SHORT: Record<BaselineOrigin, string> = {
  absent: "",
  exact: "",
  reconstructed: "reconstructed",
  unknown: "unknown baseline",
};

const note = computed(() => (baseline ? Diff.baselineNote(baseline) : undefined));
const short = computed(() => (baseline ? BASELINE_SHORT[baseline] : ""));

const onHead = computed(() => !at.value || at.value === head?.turn);

const tag = computed(() => {
  const turn = at.value ?? head?.turn;
  const index = list.findIndex((one) => one.turn === turn);
  if (index < 0) return "on disk";
  return `v${index + 1} · t${turn}${onHead.value ? " · head" : ""}`;
});

function pick(version: FileVersion): void {
  at.value = version.turn === head?.turn ? undefined : version.turn;
}

function ageOf(version: FileVersion): string {
  return version.at ? relativeAge(new Date(version.at).toISOString()) : "";
}

function titleOf(version: FileVersion, index: number): string {
  const age = ageOf(version);
  const head = `${version.by} · t${version.turn}${age ? ` · ${age} ago` : ""} · +${version.added} −${version.removed}`;
  // The baseline belongs to the first version, so its sentence rides there rather than on every tab.
  return index === 0 && note.value ? `${head}\n${note.value.text}` : head;
}

function tellOf(version: FileVersion, index: number): string {
  return `On v${index + 1} of ${slug}, written at turn ${version.turn} by ${version.by}`;
}
</script>

<template>
  <div class="strip" data-region="version-tabs">
    <div class="tabs" aria-label="Versions of this artifact">
      <UiChip
        v-for="(version, index) in list"
        :key="version.turn"
        class="tab focusable"
        data-cmt="version"
        :data-cmt-label="`v${index + 1}`"
        :data-cmt-tell="tellOf(version, index)"
        :selected="version.turn === (at ?? head?.turn)"
        :title="titleOf(version, index)"
        @click="pick(version)"
      >
        v{{ index + 1 }}
        <span class="turn mono-meta">t{{ version.turn }}</span>
        <span v-if="version.created" class="turn mono-meta">new</span>
      </UiChip>

      <span v-if="unreachable" class="note mono-meta" data-tone="loud">the version store could not be read</span>
      <span v-else-if="skipped" class="note mono-meta">not versioned — {{ skipped }}</span>
      <span v-else-if="!list.length && listed" class="note mono-meta">no turn has written this file yet</span>
      <span v-else-if="short" class="note mono-meta" :data-tone="note?.tone" :title="note?.text">{{ short }}</span>
    </div>

    <span class="spacer" />

    <span v-if="reading" class="note reading mono-meta">reading…</span>
    <span v-if="list.length" class="version mono-meta" data-region="version-badge" :data-head="onHead ? '' : undefined">
      {{ tag }}
    </span>
    <button v-if="!onHead" v-press class="latest focusable" type="button" @click="at = undefined">Latest</button>
  </div>
</template>

<style scoped>
.strip {
  @apply flex items-center gap-2 border-b border-b-border px-0 pt-2 pb-2.5;
}

/* A chip's height even before the list lands, so the page below never jumps when it does. */
.tabs {
  @apply flex min-h-7 min-w-0 scrollbar-none items-center gap-1 overflow-x-auto;
}

.tab {
  @apply flex-none whitespace-nowrap;
}

.turn {
  @apply opacity-75;
}

.spacer {
  @apply flex-1;
}

.note {
  @apply flex-none whitespace-nowrap text-subtle;
}

/* Loud is a warning, never an error: an honest gap is not a failure. */
.note[data-tone="loud"] {
  @apply text-warning;
}

.reading {
  @apply shimmer;
}

.version {
  @apply flex-none rounded-selector bg-fg px-2.5 py-1.25 text-canvas;
}

.version[data-head] {
  @apply bg-primary text-primary-content;
}

.latest {
  @apply flex-none cursor-pointer rounded-selector border border-border bg-raised px-2.75 py-1.25 typo-caption-strong text-fg transition-colors duration-(--duration-fast) ease-out;
}

.latest:hover {
  @apply border-fg;
}

@media (prefers-reduced-motion: reduce) {
  .tab,
  .latest {
    @apply transition-none;
  }
}
</style>
