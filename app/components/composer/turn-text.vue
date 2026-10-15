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
  @apply flex min-w-0 flex-col gap-1.5;
}

.folded {
  @apply min-w-0 rounded-field border border-border bg-raised;
}

.xyz {
  @apply min-w-0 rounded-field border border-primary bg-primary-soft;
}

summary {
  @apply flex cursor-pointer list-none items-center gap-1.5 px-2 py-1;
}

summary::-webkit-details-marker {
  @apply hidden;
}

.caret {
  @apply size-0 flex-none border-t-4 border-b-4 border-l-5 border-t-transparent border-b-transparent border-l-subtle transition-transform duration-(--duration-fast) ease-out;
}

.folded[open] .caret,
.xyz[open] .caret {
  @apply rotate-90;
}

.tag {
  @apply flex-none text-muted;
}

.xyz-label {
  @apply flex-none font-semibold text-primary-deep;
}

.gist {
  @apply min-w-0 truncate typo-caption text-subtle;
}

/* Folded, never dropped: the whole blob is still here, and it scrolls rather than widening the bubble. */
pre {
  @apply m-0 max-h-[40vh] max-w-full overflow-auto border-t border-t-border px-2 py-1.5 font-mono typo-caption leading-normal;
}

/* Prose, not code: it wraps instead of scrolling sideways. */
.xyz-body {
  @apply whitespace-pre-wrap;
}

@media (prefers-reduced-motion: reduce) {
  .caret {
    @apply transition-none;
  }
}
</style>
