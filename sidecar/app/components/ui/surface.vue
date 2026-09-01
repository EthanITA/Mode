<script lang="ts">
export const SURFACE_VARIANTS = [
  "card",
  "flat",
  "glass",
  "glass-liquid",
  "raised",
  "sunken",
] as const;
export type SurfaceVariant = (typeof SURFACE_VARIANTS)[number];

export const SURFACE_SHAPES = ["island", "pill"] as const;
export type SurfaceShape = (typeof SURFACE_SHAPES)[number];
</script>

<script lang="ts" setup>
const { as, shape, variant = "card" } = defineProps<{
  as?: string;
  shape?: SurfaceShape;
  variant?: SurfaceVariant;
}>();

const tag = computed(() => as ?? "div");
</script>

<template>
  <component
    :is="tag"
    v-liquid-glass="variant === 'glass-liquid'"
    :data-surface="variant"
    :data-surface-shape="shape"
  >
    <slot />
  </component>
</template>
