<script lang="ts" setup>
import { Check, ChevronDown, ChevronUp } from "@lucide/vue";
import type { FrameView } from "~/composables/useCanvas";

const { frame } = defineProps<{ frame: FrameView }>();

const emit = defineEmits<{ toggle: [] }>();

const style = computed(() => ({
  height: `${frame.height}px`,
  left: `${frame.x}px`,
  top: `${frame.y}px`,
  width: `${frame.width}px`,
}));
</script>

<template>
  <div :data-status="frame.status" :style="style" class="frame">
    <header :data-cmt-label="frame.title" :data-cmt-tell="frame.tell" class="frame-head" data-cmt="task">
      <span class="frame-pip">
        <UiIcon v-if="frame.status === 'done'" :icon="Check" size="xs" />
      </span>
      <span class="frame-turn">{{ frame.turn }}</span>
      <span class="frame-title">{{ frame.title }}</span>
      <span v-if="frame.status === 'working'" class="frame-badge">Claude working</span>
      <span class="frame-count">{{ plural(frame.count, "artifact") }}</span>
      <button
        v-press
        :title="frame.open ? 'Collapse' : 'Expand'"
        class="frame-toggle plain-button focusable"
        type="button"
        @click="emit('toggle')"
      >
        <UiIcon :icon="frame.open ? ChevronUp : ChevronDown" size="xs" />
      </button>
    </header>
  </div>
</template>

<style scoped>
/* The box is decoration over the cards it groups; only the header takes the pointer,
   so a drag across a frame's empty interior still starts a marquee on the canvas. */
.frame {
  @apply pointer-events-none absolute rounded-2xl border-[1.5px] border-dashed border-border-strong;
}

.frame[data-status="working"] {
  @apply border-primary;
}

.frame[data-status="waiting"] {
  @apply border-warning;
}

.frame-head {
  @apply pointer-events-auto flex h-10.5 items-center gap-2 py-0 pr-2 pl-3;
}

.frame-pip {
  @apply grid size-4.5 flex-none place-items-center rounded-full bg-sunken;
}

.frame[data-status="done"] .frame-pip {
  @apply text-success;
}

.frame[data-status="working"] .frame-pip {
  @apply bg-primary;
}

.frame[data-status="waiting"] .frame-pip {
  @apply bg-warning;
}

.frame-turn {
  @apply flex-none font-mono typo-meta-semibold text-muted;
}

.frame-title {
  @apply min-w-0 flex-1 truncate font-sans text-[12.5px] font-bold tracking-[-0.01em];
}

.frame-badge {
  @apply inline-flex h-5 flex-none items-center rounded-full bg-primary-soft px-2 py-0 font-mono text-[10.5px] font-medium whitespace-nowrap text-primary-deep;
}

.frame-count {
  @apply flex-none font-mono text-[10.5px] font-medium whitespace-nowrap text-subtle;
}

.frame-toggle {
  @apply grid size-6 flex-none place-items-center rounded-full text-muted;
}

.frame-toggle:hover {
  @apply bg-sunken text-fg;
}
</style>
