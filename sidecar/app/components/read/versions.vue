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

// Wording agreed with Chronicle so Read and History name the four baseline states identically.
const BASELINE_SHORT: Record<BaselineOrigin, string> = {
  absent: "",
  exact: "",
  reconstructed: "reconstructed",
  unknown: "unknown baseline",
};

const BASELINE_FULL: Record<BaselineOrigin, string> = {
  absent: "this file did not exist before the conversation touched it",
  exact: "",
  reconstructed: "the state before the first touch was reconstructed by replaying the edits backwards",
  unknown:
    "we could not reconstruct what this file looked like before the conversation touched it, so the first change shown here is measured against an unknown starting point",
};

const short = computed(() => (baseline ? BASELINE_SHORT[baseline] : ""));
const full = computed(() => (baseline ? BASELINE_FULL[baseline] : ""));

const at = defineModel<number>();

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
</script>

<template>
  <div class="strip" data-region="version-tabs">
    <div class="tabs" role="tablist" aria-label="Versions of this artifact">
      <button
        v-for="(version, index) in list"
        :key="version.turn"
        class="tab focusable"
        type="button"
        role="tab"
        :aria-selected="version.turn === (at ?? head?.turn)"
        :data-active="version.turn === (at ?? head?.turn) ? '' : undefined"
        :data-baseline="index === 0 ? baseline : undefined"
        :title="`${version.by} · t${version.turn}${ageOf(version) ? ` · ${ageOf(version)} ago` : ''} · +${version.added} −${version.removed}`"
        @click="pick(version)"
      >
        v{{ index + 1 }}
        <span class="turn mono-meta">t{{ version.turn }}</span>
        <span v-if="version.created" class="turn mono-meta">new</span>
      </button>

      <span v-if="unreachable" class="note mono-meta">the version store could not be read</span>
      <span v-else-if="skipped" class="note mono-meta">not versioned · {{ skipped }}</span>
      <span v-else-if="!list.length" class="note mono-meta">no turn has written this file yet</span>
      <span
        v-else-if="baseline && BASELINE_NOTE[baseline]"
        class="note mono-meta"
        :data-baseline="baseline"
      >
        {{ BASELINE_NOTE[baseline] }}
      </span>
    </div>

    <span class="spacer" />

    <span v-if="reading" class="note mono-meta">reading…</span>
    <span v-if="list.length" class="version mono-meta" data-region="version-badge" :data-head="onHead ? '' : undefined">
      {{ tag }}
    </span>
    <button v-if="!onHead" class="latest focusable" type="button" @click="at = undefined">Latest</button>
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
  display: flex;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.tab {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  flex: none;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  gap: 6px;
  padding: 5px 11px;
  transition: border-color var(--duration-fast) var(--ease-out);
  white-space: nowrap;
}

.tab:hover {
  border-color: var(--ink);
}

.tab[data-active] {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--canvas);
}

/* A baseline nobody could reconstruct is not the same as a version that changed nothing. */
.tab[data-baseline="reconstructed"] {
  border-style: dashed;
}

.tab[data-baseline="unknown"] {
  border-color: var(--warning);
  border-style: dashed;
}

.note[data-baseline="unknown"] {
  color: var(--warning);
}

.turn {
  opacity: 0.75;
}

.spacer {
  flex: 1;
}

.note {
  color: var(--subtle);
  white-space: nowrap;
}

.version {
  background: var(--ink);
  border-radius: 999px;
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
  border-radius: 999px;
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
