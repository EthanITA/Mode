<script lang="ts" setup>
const { head } = useDeskCards();
</script>

<template>
  <UiSurface v-island-pop="'top left'" class="head" data-region="desk-head" variant="glass" shape="island">
    <span class="wordmark"><span class="thin">side</span>car</span>
    <span class="rule" />
    <span class="status mono-meta">{{ head }}</span>
  </UiSurface>
</template>

<style scoped>
.head {
  align-items: center;
  display: flex;
  flex: none;
  gap: 10px;
  height: var(--island-row-h);
  padding: 0 16px 0 14px;
}

.wordmark {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.thin {
  font-weight: 300;
}

.rule {
  background: var(--border-strong);
  flex: none;
  height: 16px;
  width: 1px;
}

.status {
  color: var(--muted);
}
</style>
