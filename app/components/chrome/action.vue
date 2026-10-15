<script lang="ts" setup>
import { tipText } from "@cela/design";
import type { Component } from "vue";

// An inset one sits with others inside a single island instead of being an island of its own.
export type ActionShape = "inset" | "island" | "pill";

const { icon, isDisabled, isOn, isPressed, isQuiet, label, shape, tip } = defineProps<{
  icon: Component;
  isDisabled?: boolean;
  /** A mode it arms, drawn in the primary colour. */
  isOn?: boolean;
  /** A panel it opens, drawn raised. */
  isPressed?: boolean;
  isQuiet?: boolean;
  label?: string;
  shape: ActionShape;
  tip: string;
}>();

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <UiSurface
    v-if="shape === 'island'"
    v-island-pop="'top right'"
    class="island"
    pad="none"
    shape="pill"
    variant="glass-liquid"
  >
    <button
      v-press
      class="action focusable"
      type="button"
      :aria-label="label ? undefined : tipText(tip)"
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
    class="action focusable"
    type="button"
    :aria-label="label ? undefined : tipText(tip)"
    :aria-pressed="isOn ?? isPressed"
    :class="shape"
    :data-labelled="!!label"
    :data-on="isOn"
    :data-pressed="isPressed"
    :data-quiet="isQuiet"
    :data-tip="tip"
    :disabled="isDisabled"
    @click="emit('click', $event)"
  >
    <UiIcon :icon="icon" :size="shape === 'inset' ? 'md' : 'xs'" />
    <template v-if="label">{{ label }}</template>
  </button>
</template>

<style scoped>
.island {
  @apply flex h-(--island-row-h) flex-none;
}

.action {
  @apply inline-flex h-full flex-none cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-transparent px-3.5 py-0 text-[12.5px] font-semibold text-fg transition-[background-color,border-color,color] duration-(--duration-press) ease-[ease];
}

.action[data-labelled="false"] {
  @apply w-(--island-row-h) p-0;
}

/* A bar that is not the app's own, such as the dark editor's, retints the pill through these two. */
.pill {
  @apply h-6.5 gap-1.5 border border-[color:var(--action-line,var(--border-strong))] px-2.75 py-0 text-[11.5px] text-[color:var(--action-ink,var(--ink))];
}

.pill[data-labelled="false"] {
  @apply w-6.5;
}

.inset {
  @apply h-8;
}

.inset[data-labelled="false"] {
  @apply w-8;
}

.inset[data-quiet="true"] {
  @apply text-muted;
}

.inset[data-pressed="true"] {
  @apply bg-raised shadow-sm;
}

.inset:disabled {
  @apply cursor-default text-subtle;
}

@media (hover: hover) and (pointer: fine) {
  .pill:hover {
    @apply border-[color:var(--action-ink,var(--ink))];
  }

  .island .action:hover {
    @apply text-primary;
  }

  .inset:not(:disabled, [data-on="true"], [data-pressed="true"]):hover {
    @apply bg-canvas text-fg;
  }
}

.action[data-on="true"],
.island .action[data-on="true"]:hover {
  @apply border-primary bg-primary text-primary-content;
}
</style>
