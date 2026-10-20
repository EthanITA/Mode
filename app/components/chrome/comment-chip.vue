<script lang="ts" setup>
import type { CommentOffer } from "~/composables/useChrome";

const { offer } = defineProps<{ offer: CommentOffer }>();

const chrome = useChrome();

// Room for the chip above the line, and its widest label, so it never clips at the top or the inline start.
const LIFT = 40;
const CHIP_W = 140;
const EDGE = 12;

const isBelow = computed(() => offer.end.top - LIFT < chrome.frame.insets.value.top);
const place = computed(() => ({
  left: `${Math.min(Math.max(offer.end.right, CHIP_W + EDGE), window.innerWidth - EDGE)}px`,
  top: `${isBelow.value ? offer.end.bottom : offer.end.top}px`,
}));
</script>

<template>
  <!-- mousedown would collapse a selection in the app's own document before the click lands. -->
  <UiButton
    v-island-pop="isBelow ? 'top right' : 'bottom right'"
    class="chip"
    data-region="select-ask"
    :data-below="isBelow"
    :data-tip="offer.spot.ask ? 'Ask on the side · {cmd k}' : 'Note it for the session · {cmd k}'"
    size="xs"
    :style="place"
    variant="secondary"
    @mousedown.prevent
    @click="chrome.comment.openOffer()"
  >
    {{ offer.spot.ask ? "Ask Claude" : "Note for Claude" }}
  </UiButton>
</template>

<style scoped>
.chip {
  @apply pointer-events-auto fixed z-35 -mt-1.5 -translate-x-full -translate-y-full shadow-md;
}

.chip[data-below="true"] {
  @apply mt-1.5 translate-y-0;
}
</style>
