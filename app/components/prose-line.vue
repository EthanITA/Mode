<script lang="ts">
import type { InjectionKey } from "vue";
import type { LineSpan } from "~/utils/monaco/notes";

export const revealLines: InjectionKey<(lines: LineSpan) => void> = Symbol("reveal-lines");
</script>

<script lang="ts" setup>
const { from, to } = defineProps<{ from: number; to: number }>();

const reveal = inject(revealLines, undefined);
</script>

<template>
  <button
    class="line-ref focusable"
    type="button"
    :data-tip="`Show ${from === to ? `line ${from}` : `lines ${from}-${to}`}`"
    @click="reveal?.([from, to])"
  >
    <slot />
  </button>
</template>

<style scoped>
.line-ref {
  @apply cursor-pointer rounded-full border-0 bg-primary-soft px-1.5 py-px typo-mono-meta whitespace-nowrap text-primary-deep;
}
</style>
