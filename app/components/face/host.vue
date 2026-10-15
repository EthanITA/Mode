<script lang="ts" setup>
import type { Component } from "vue";

const { face, view } = defineProps<{ face: Face; view: Component }>();

const chrome = useChrome();
const shown = computed(() => chrome.view.current.value === face);
provide(FACE_SHOWN, shown);
</script>

<template>
  <div v-show="shown" class="face" :data-face="face">
    <component :is="view" />
  </div>
</template>

<style scoped>
/* Kept mounted once opened, so coming back fades in what was there instead of reading it all again. */
.face {
  @apply h-full min-h-0 settle;
}
</style>
