<script lang="ts" setup>
import type { Component } from "vue";

export type ActionShape = "island" | "pill";

const { icon, isOn, label, shape, tip } = defineProps<{
  icon: Component;
  isOn?: boolean;
  label?: string;
  shape: ActionShape;
  tip: string;
}>();

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <UiSurface v-if="shape === 'island'" v-island-pop="'top right'" class="island" pad="none" shape="pill" variant="glass-liquid">
    <button
      v-press
      class="action focusable"
      type="button"
      :aria-label="label ? undefined : tip"
      :aria-pressed="isOn"
      :data-labelled="!!label"
      :data-on="isOn"
      :data-tip="tip"
      @click="emit('click', $event)"
    >
      <UiIcon :icon="icon" size="sm" />
      <template v-if="label">{{ label }}</template>
    </button>
  </UiSurface>

  <button
    v-else
    v-press
    class="action pill focusable"
    type="button"
    :aria-label="label ? undefined : tip"
    :aria-pressed="isOn"
    :data-labelled="!!label"
    :data-on="isOn"
    :data-tip="tip"
    @click="emit('click', $event)"
  >
    <UiIcon :icon="icon" size="xs" />
    <template v-if="label">{{ label }}</template>
  </button>
</template>

<style scoped>
.island {
  display: flex;
  flex: none;
  height: var(--island-row-h);
}

.action {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  flex: none;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  gap: 8px;
  height: 100%;
  justify-content: center;
  padding: 0 14px;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.action[data-labelled="false"] {
  padding: 0;
  width: var(--island-row-h);
}

/* A bar that is not the app's own, such as the dark editor's, retints the pill through these two. */
.pill {
  border: 1px solid var(--action-line, var(--border-strong));
  color: var(--action-ink, var(--ink));
  font-size: 11.5px;
  gap: 6px;
  height: 26px;
  padding: 0 11px;
}

.pill[data-labelled="false"] {
  width: 26px;
}

@media (hover: hover) and (pointer: fine) {
  .pill:hover {
    border-color: var(--action-ink, var(--ink));
  }

  .island .action:hover {
    color: var(--primary);
  }
}

.action[data-on="true"],
.island .action[data-on="true"]:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-content);
}
</style>
