<script lang="ts" setup>
const chrome = useChrome();
</script>

<template>
  <div v-if="chrome.toasts.value.length" class="toaster" role="status" aria-live="polite">
    <UiToast v-for="row in chrome.toasts.value" :key="row.id" :variant="row.tone">
      {{ row.text }}
    </UiToast>
  </div>
</template>

<style scoped>
.toaster {
  align-items: center;
  bottom: 110px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  left: 50%;
  pointer-events: none;
  position: fixed;
  transform: translateX(-50%);
  z-index: 50;
}
</style>
