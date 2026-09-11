<script lang="ts" setup>
import type { BaselineOrigin, FileVersion } from "~~/shared/types/versions";

const {
  baseline,
  head,
  list,
  reading = false,
  skipped,
  slug,
  unreachable = false,
} = defineProps<{
  baseline?: BaselineOrigin;
  head?: FileVersion;
  list: FileVersion[];
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
      <span v-else-if="!list.length" class="note mono-meta">no turn has written this file yet</span>
      <span v-else-if="short" class="note mono-meta" :data-tone="note?.tone" :title="note?.text">{{ short }}</span>
    </div>

    <span class="spacer" />

    <span v-if="reading" class="note mono-meta">reading…</span>
    <span v-if="list.length" class="version mono-meta" data-region="version-badge" :data-head="onHead ? '' : undefined">
      {{ tag }}
    </span>
    <button v-if="!onHead" v-press class="latest focusable" type="button" @click="at = undefined">Latest</button>
  </div>
</template>

<style scoped>
.strip {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 8px;
  padding: 8px 0 10px;
}

.tabs {
  align-items: center;
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.tab {
  flex: none;
  white-space: nowrap;
}

.turn {
  opacity: 0.75;
}

.spacer {
  flex: 1;
}

.note {
  color: var(--subtle);
  flex: none;
  white-space: nowrap;
}

/* Loud is a warning, never an error: an honest gap is not a failure. */
.note[data-tone="loud"] {
  color: var(--warning);
}

.version {
  background: var(--ink);
  border-radius: var(--radius-selector);
  color: var(--canvas);
  flex: none;
  padding: 5px 10px;
}

.version[data-head] {
  background: var(--primary);
  color: var(--primary-content);
}

.latest {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-selector);
  color: var(--ink);
  cursor: pointer;
  flex: none;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  padding: 5px 11px;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.latest:hover {
  border-color: var(--ink);
}

@media (prefers-reduced-motion: reduce) {
  .tab,
  .latest {
    transition: none;
  }
}
</style>
