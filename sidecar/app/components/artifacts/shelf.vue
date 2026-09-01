<script lang="ts" setup>
const { artifacts, pending, error } = useArtifacts()
const selected = useArtifactSelection()

const select = (slug: string): void => {
  selected.value = slug
}
</script>

<template>
  <nav class="shelf" aria-label="This conversation's artifacts">
    <div class="shelf-head">
      <span class="lbl">Shelf</span>
      <span class="tally">{{ artifacts.length }} artifact{{ artifacts.length === 1 ? "" : "s" }}</span>
    </div>

    <p v-if="pending && !artifacts.length" class="shelf-state">Loading…</p>
    <p v-else-if="error" class="shelf-state" data-tone="error">Could not load artifacts.</p>
    <p v-else-if="!artifacts.length" class="shelf-state">No artifacts in this conversation yet.</p>

    <ol v-else class="shelf-rows">
      <li v-for="(artifact, i) in artifacts" :key="artifact.slug">
        <button
          type="button"
          class="shelf-row"
          :aria-current="selected === artifact.slug ? 'true' : undefined"
          :data-current="selected === artifact.slug"
          @click="select(artifact.slug)"
        >
          <span class="n">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="s">{{ artifact.slug }}</span>
          <span v-if="artifact.updated" class="u">{{ artifact.updated }}</span>
        </button>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.shelf {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  font-family: var(--sans);
}

.shelf-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 12px;
  background: var(--sunken);
  border-bottom: 1px solid var(--border);
}
.shelf-head .lbl {
  font-family: var(--mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--muted);
}
.shelf-head .tally {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 0.68rem;
  color: var(--subtle);
}

.shelf-state {
  padding: 16px;
  font-size: 13px;
  color: var(--muted);
}
.shelf-state[data-tone="error"] {
  color: var(--error);
}

.shelf-rows {
  list-style: none;
  margin: 0;
  padding: 6px 8px;
}

.shelf-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: baseline;
  width: 100%;
  padding: 6px 9px;
  border: 0;
  background: none;
  border-radius: var(--radius-field);
  color: var(--muted);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}
.shelf-row:hover {
  background: var(--raised);
  color: var(--ink);
}
.shelf-row:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
.shelf-row[data-current="true"] {
  background: var(--raised);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
}
.shelf-row[data-current="true"] .s {
  font-weight: 500;
}

.shelf-row .n {
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--subtle);
}
.shelf-row .s {
  font-family: var(--mono);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shelf-row .u {
  font-family: var(--mono);
  font-size: 9.5px;
  color: var(--subtle);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
</style>
