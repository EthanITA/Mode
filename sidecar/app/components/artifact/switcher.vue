<script lang="ts" setup>
const sc = useSidecar();
const { artifactRows } = useScreen();

const updated = computed(() => relativeAge(sc.artifact.value?.updated));
</script>

<template>
  <div class="switcher">
    <div class="pills" data-region="artifact-switcher" role="tablist" aria-label="Artifacts in this conversation">
      <button
        v-for="row in artifactRows"
        :key="row.slug"
        class="pill focusable"
        type="button"
        role="tab"
        :data-active="row.slug === sc.slug.value ? '' : undefined"
        :aria-selected="row.slug === sc.slug.value"
        @click="sc.slug.value = row.slug"
      >
        {{ row.title }}
      </button>
      <span v-if="!artifactRows.length" class="empty">This conversation has stamped no artifact yet.</span>
    </div>

    <div class="meta">
      <span class="version mono-meta" data-region="version-badge" data-scaffold>
        <span class="scaffold-body">v—</span>
        <UiScaffoldMark phase="no versions" why="No version store exists, and git cannot supply one. Phase 3." />
      </span>
      <span v-if="updated" class="age mono-meta">updated {{ updated }} ago</span>
      <button
        class="collapse focusable plain-button mono-meta"
        type="button"
        data-region-toggle="panel"
        :aria-expanded="sc.panelOpen.value"
        @click="sc.panelOpen.value = !sc.panelOpen.value"
      >
        {{ sc.panelOpen.value ? "hide conversation" : "show conversation" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.switcher {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 14px 0 16px;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.pill {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
  max-width: 240px;
  overflow: hidden;
  padding: 5px 13px;
  text-overflow: ellipsis;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
  white-space: nowrap;
}

.pill:hover {
  background: var(--sunken);
  color: var(--ink);
}

.pill[data-active] {
  background: var(--secondary);
  color: var(--canvas);
  font-weight: 600;
}

.empty {
  color: var(--subtle);
  font-size: 13px;
}

.meta {
  align-items: center;
  color: var(--subtle);
  display: flex;
  flex: none;
  gap: 10px;
}

.version {
  align-items: center;
  display: inline-flex;
  gap: 6px;
}

.collapse {
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  padding: 4px 10px;
  transition: color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}

.collapse:hover {
  border-color: var(--border-strong);
  color: var(--ink);
}

@media (prefers-reduced-motion: reduce) {
  .pill,
  .collapse {
    transition: none;
  }
}
</style>
