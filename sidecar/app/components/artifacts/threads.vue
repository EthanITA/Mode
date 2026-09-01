<script lang="ts" setup>
import { threadTally } from "~/composables/useArtifacts"

const selected = useArtifactSelection()
const { artifact, pending, error } = useArtifact(selected)
</script>

<template>
  <section class="threads" aria-label="Review threads on the selected artifact">
    <p v-if="!selected" class="threads-state">Select an artifact from the shelf to read its threads.</p>

    <template v-else>
      <header class="threads-head">
        <div class="meta">
          <span class="slug">{{ selected }}</span>
          <template v-if="artifact">
            <span v-if="artifact.ds">{{ artifact.ds }}</span>
            <span v-if="artifact.target">target {{ artifact.target }}</span>
            <span v-if="artifact.updated">{{ artifact.updated }}</span>
          </template>
        </div>
        <template v-if="artifact">
          <a v-if="artifact.url" class="url" :href="artifact.url" target="_blank" rel="noopener">{{ artifact.url }}</a>
          <span v-else class="url" data-tone="none">not published</span>
          <span class="tally">{{ threadTally(artifact.threads) }}</span>
        </template>
      </header>

      <p v-if="pending" class="threads-state">Loading…</p>
      <p v-else-if="error" class="threads-state" data-tone="error">Could not load this artifact's threads.</p>

      <div v-else-if="artifact && artifact.threads.length === 0" class="threads-empty">
        <p class="lede">No review threads yet.</p>
        <p class="sub">Comments left on this artifact will show up here, anchored to the line they're about.</p>
      </div>

      <ol v-else-if="artifact" class="thread-list">
        <li v-for="thread in artifact.threads" :key="thread.id">
          <ArtifactsThread :thread="thread" />
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.threads {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  font-family: var(--sans);
}

.threads-state {
  padding: 20px 22px;
  font-size: 13.5px;
  color: var(--muted);
}
.threads-state[data-tone="error"] {
  color: var(--error);
}

.threads-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--canvas);
  padding: 16px 22px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.threads-head .meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--subtle);
  width: 100%;
}
.threads-head .slug {
  color: var(--primary-deep);
}
.threads-head .url {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.threads-head .url[data-tone="none"] {
  color: var(--subtle);
  font-style: italic;
}
.threads-head .tally {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--subtle);
}

.threads-empty {
  padding: 44px 22px;
  text-align: center;
}
.threads-empty .lede {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  margin: 0 0 6px;
}
.threads-empty .sub {
  font-size: 13px;
  color: var(--muted);
  max-width: 42ch;
  margin: 0 auto;
}

.thread-list {
  list-style: none;
  margin: 0;
  padding: 4px 22px 22px;
}
</style>
