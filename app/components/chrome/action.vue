<script lang="ts" setup>
import { tipText } from "@cela/design";
import type { Component } from "vue";

// An inset one sits with others inside a single island instead of being an island of its own.
export type ActionShape = "inset" | "island" | "pill";

const { icon, isDisabled, isOn, isPressed, label, shape, tip } = defineProps<{
  icon: Component;
  isDisabled?: boolean;
  /** A mode it arms, drawn in the primary colour. */
  isOn?: boolean;
  /** A panel it opens, drawn held down. */
  isPressed?: boolean;
  label?: string;
  shape: ActionShape;
  tip: string;
}>();

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <UiChip
    v-if="shape === 'pill'"
    class="pill"
    :aria-label="label ? undefined : tipText(tip)"
    :data-tip="tip"
    :disabled="isDisabled"
    :selected="isOn"
    size="xs"
    @click="emit('click', $event)"
  >
    <UiIcon :icon="icon" size="xs" />
    <template v-if="label">{{ label }}</template>
  </UiChip>

  <UiSurface
    v-else-if="shape === 'island'"
    v-island-pop="'top right'"
    class="island"
    pad="none"
    shape="pill"
    variant="glass-liquid"
  >
    <UiIconButton
      :aria-label="label ? undefined : tipText(tip)"
      :aria-pressed="isOn || isPressed"
      :data-tip="tip"
      :disabled="isDisabled"
      :icon="icon"
      size="md"
      :tone="isOn ? 'primary' : 'neutral'"
      @click="emit('click', $event)"
    >
      <template v-if="label" #default>{{ label }}</template>
    </UiIconButton>
  </UiSurface>

  <UiIconButton
    v-else
    :aria-label="label ? undefined : tipText(tip)"
    :aria-pressed="isOn || isPressed"
    :data-tip="tip"
    :disabled="isDisabled"
    :icon="icon"
    size="md"
    :tone="isOn ? 'primary' : 'neutral'"
    @click="emit('click', $event)"
  >
    <template v-if="label" #default>{{ label }}</template>
  </UiIconButton>
</template>

<style scoped>
.island {
  @apply island-row px-1;
}

.pill {
  @apply gap-1;
}
</style>
