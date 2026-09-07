<script lang="ts" setup>
const sc = useSidecar();

loadSidecar();

function open(key: string): void {
  sc.sessionKey.value = key;
  navigateTo(`/c/${key}`);
}
</script>

<template>
  <div class="shell">
    <DeskHead />
    <DeskGrid @open="open" />

    <p v-if="sc.failure.value" class="failure" role="alert">
      The sidecar server did not answer: {{ sc.failure.value }}
    </p>
  </div>
</template>

<style scoped>
.shell {
  background: var(--canvas);
  height: 100vh;
}

.failure {
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-field);
  bottom: 16px;
  color: var(--error);
  font-size: 13px;
  left: 16px;
  margin: 0;
  padding: 9px 13px;
  position: fixed;
  z-index: 30;
}
</style>
