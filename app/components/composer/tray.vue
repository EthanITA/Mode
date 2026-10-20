<script lang="ts" setup>
import { X } from "@lucide/vue";

const tray = useTray();

const others = computed(() => tray.items.value.filter((item) => item.kind !== "comment" && !item.isSent));
</script>

<template>
  <div v-if="others.length" class="tray" data-region="composer-tray">
    <span
      v-for="item in others"
      :key="item.id"
      class="chip"
      :data-kind="item.kind"
      data-cmt="tray-chip"
      :data-cmt-label="`${item.kind} waiting to send`"
      data-cmt-tell="About the note I left in the tray"
      :data-cmt-excerpt="item.text"
    >
      <span class="kind mono-meta">{{ item.kind }}</span>
      <span class="what">
        <span v-if="item.quote" class="quote">“{{ item.quote }}”</span>
        <span v-else-if="item.source" class="quote">{{ item.source }}</span>
        {{ item.text }}
      </span>
      <UiIconButton
        :icon="X"
        :label="`Take this ${item.kind} out of the tray`"
        size="xs"
        variant="filled"
        @click="tray.remove(item.id)"
      />
    </span>
  </div>
</template>

<style scoped>
.tray {
  @apply flex flex-wrap gap-1.5 px-1.5 py-0;
}

/* The dock is click-through, so each chip opts back in and the gaps between them stay the page's. */
.chip {
  @apply pointer-events-auto inline-flex h-7.5 max-w-105 items-center gap-2 rounded-full border border-border-strong bg-raised py-0 pr-1 pl-3 typo-caption shadow-sm;
}

.kind {
  @apply flex-none text-primary;
}

.chip[data-kind="task"] .kind {
  @apply text-warning;
}

.what {
  @apply min-w-0 truncate text-fg;
}

.quote {
  @apply text-muted;
}
</style>
