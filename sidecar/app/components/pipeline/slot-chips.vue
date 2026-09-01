<script lang="ts" setup>
const { slots } = useScreen();
</script>

<template>
  <span class="chips">
    <span
      v-for="slot in slots"
      :key="slot.axis"
      class="chip mono-meta"
      :data-tint="slot.tint"
      :data-how="slot.how"
      :title="`${slot.axis}: ${slot.summary}`"
    >
      {{ slot.label }}
    </span>
  </span>
</template>

<style scoped>
.chips {
  display: inline-flex;
  flex: none;
  gap: 5px;
}

/* The sigil and the contract name are literal strings from bin/mode, so they keep their case. */
.chip {
  background: color-mix(in oklch, var(--tint) 13%, transparent);
  border-radius: 999px;
  color: var(--tint);
  cursor: help;
  padding: 3px 9px;
  text-transform: none;
}

/* An empty slot is a real state, not a missing one: it reads as off rather than as a colour. */
.chip[data-how="auto"] {
  background: var(--sunken);
  color: var(--subtle);
}
</style>
