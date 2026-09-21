<script lang="ts" setup>
const { value } = defineProps<{ value: string }>();

const split = computed(() => splitXyz(value));
const segments = computed(() => turnSegments(split.value.body));
</script>

<template>
  <div class="turn-text">
    <details v-if="split.xyz" open class="xyz" data-region="turn-xyz">
      <summary v-press class="focusable">
        <span class="caret" />
        <span class="xyz-label mono-meta">X / Y / Z read</span>
      </summary>
      <pre class="xyz-body">{{ split.xyz }}</pre>
    </details>

    <template v-for="(part, index) in segments" :key="index">
      <Prose v-if="part.kind === 'prose'" :value="part.text" />
      <details v-else class="folded" data-region="turn-block">
        <summary v-press class="focusable">
          <span class="caret" />
          <span class="tag mono-meta">{{ part.tag }}</span>
          <span class="gist">{{ part.summary }}</span>
        </summary>
        <pre v-if="part.body">{{ part.body }}</pre>
      </details>
    </template>
  </div>
</template>

<style scoped>
.turn-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.folded {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-field);
  min-width: 0;
}

.xyz {
  background: var(--primary-soft);
  border: 1px solid var(--primary);
  border-radius: var(--radius-field);
  min-width: 0;
}

summary {
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: 6px;
  list-style: none;
  padding: 4px 8px;
}

summary::-webkit-details-marker {
  display: none;
}

.caret {
  border-bottom: 3.5px solid transparent;
  border-left: 5px solid var(--subtle);
  border-top: 3.5px solid transparent;
  flex: none;
  height: 0;
  transition: transform var(--duration-fast) var(--ease-out);
  width: 0;
}

.folded[open] .caret,
.xyz[open] .caret {
  transform: rotate(90deg);
}

.tag {
  color: var(--muted);
  flex: none;
}

.xyz-label {
  color: var(--primary-deep, var(--ink));
  flex: none;
  font-weight: 600;
}

.gist {
  color: var(--subtle);
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Folded, never dropped: the whole blob is still here, and it scrolls rather than widening the bubble. */
pre {
  border-top: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.5;
  margin: 0;
  max-height: 40vh;
  max-width: 100%;
  overflow: auto;
  padding: 6px 8px;
}

/* Prose, not code: it wraps instead of scrolling sideways. */
.xyz-body {
  white-space: pre-wrap;
}

@media (prefers-reduced-motion: reduce) {
  .caret {
    transition: none;
  }
}
</style>
