<script lang="ts" setup>
import { useEventListener } from "@vueuse/core";
import type { ViewRect } from "~/types/frame";

const { opener, origin } = defineProps<{ opener: string; origin: string }>();
const emit = defineEmits<{ close: []; place: [rect: ViewRect] }>();

const well = ref<HTMLElement>();
const brokenIcon = ref(false);
const favicon = computed(() => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=32`);

function measure(): void {
  const box = well.value?.getBoundingClientRect();
  if (box) emit("place", { height: box.height, width: box.width, x: box.left, y: box.top });
}

onMounted(() => {
  nextTick(measure);
  const observer = new ResizeObserver(measure);
  if (well.value) observer.observe(well.value);
  onUnmounted(() => observer.disconnect());
});
useEventListener(window, "resize", measure);
</script>

<template>
  <div class="sheet">
    <div class="scrim" @click="emit('close')" />
    <div class="card" role="dialog" aria-label="Sign in">
      <header class="bar">
        <img v-if="!brokenIcon" class="favicon" :src="favicon" alt="" @error="brokenIcon = true" />
        <svg v-else class="favicon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.4" />
          <path d="M1.75 8h12.5M8 1.75c1.8 1.7 1.8 10.8 0 12.5M8 1.75C6.2 3.45 6.2 12.55 8 14.25" stroke="currentColor" stroke-width="1.4" />
        </svg>
        <span class="origin">{{ origin }}</span>
        <span class="from">from {{ opener }}</span>
        <button type="button" class="close" aria-label="Close sign-in" @click="emit('close')">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </header>
      <div ref="well" class="well" />
    </div>
  </div>
</template>

<style scoped>
.sheet {
  @apply absolute inset-0 z-2;
}

.scrim {
  @apply absolute inset-0 bg-fg/40;
}

.card {
  @apply absolute top-1/2 left-1/2 flex h-150 max-h-[92%] w-130 max-w-[92%] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-box border border-border bg-raised shadow-lg;
}

.bar {
  @apply flex h-11 shrink-0 items-center gap-2 border-b border-border px-3.5;
}

.favicon {
  @apply size-4 rounded-sm text-subtle;
}

.origin {
  @apply typo-caption-strong text-fg;
}

.from {
  @apply typo-caption whitespace-nowrap uppercase tracking-wide text-subtle;
}

.close {
  @apply ml-auto grid size-6 shrink-0 place-items-center rounded-field text-muted transition-colors duration-(--duration-fast) ease-out;
}

.close svg {
  @apply size-3.5;
}

.close:hover {
  @apply bg-sunken text-fg;
}

/* Transparent on purpose: the OS child window carrying the real sign-in page is pinned over this well. */
.well {
  @apply min-h-0 flex-1;
}
</style>
