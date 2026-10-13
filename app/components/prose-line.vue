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
    :title="`Show ${from === to ? `line ${from}` : `lines ${from}-${to}`}`"
    @click="reveal?.([from, to])"
  >
    <slot />
  </button>
</template>

<style scoped>
.line-ref {
  background: var(--primary-soft);
  border: 0;
  border-radius: 999px;
  color: var(--primary-deep);
  cursor: pointer;
  font-family: var(--mono);
  font-size: 11px;
  padding: 1px 6px;
  white-space: nowrap;
}
</style>
