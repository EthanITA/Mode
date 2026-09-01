<script lang="ts" setup>
const sc = useSidecar();
const { artifactRows, position, tabs } = useScreen();

const title = computed(() => artifactRows.value.find((row) => row.slug === sc.slug.value)?.title);
const here = computed(() => tabs.value.find((tab) => tab.key === sc.sessionKey.value));
</script>

<template>
  <UiSurface v-island-pop="'top left'" class="capsule" data-region="session-capsule" variant="glass" shape="island">
    <span class="dots">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="pip focusable plain-button"
        type="button"
        :data-tint="tab.tint"
        :data-active="tab.key === sc.sessionKey.value ? '' : undefined"
        :title="tab.name"
        :aria-label="`Switch to ${tab.name}`"
        @click="sc.sessionKey.value = tab.key"
      />
    </span>

    <button class="crumbs focusable plain-button" type="button" @click="sc.panelOpen.value = true">
      <span class="session">{{ here?.name ?? "no conversation" }}</span>
      <span class="chev">›</span>
      <span class="artifact">{{ title ?? "no artifact" }}</span>
      <span v-if="position.count" class="pos mono-meta">{{ position.index }}/{{ position.count }}</span>
    </button>
  </UiSurface>
</template>

<style scoped>
.capsule {
  align-items: center;
  display: flex;
  gap: 12px;
  max-width: 46vw;
  padding: 7px 14px 7px 12px;
}

.dots {
  align-items: center;
  display: flex;
  flex: none;
}

/* Overlapping, the active one forward and larger. */
.pip {
  background: var(--tint);
  border: 2px solid var(--raised);
  border-radius: 999px;
  height: 16px;
  margin-right: -6px;
  opacity: 0.55;
  transition:
    height var(--duration-fast) var(--ease-out),
    opacity var(--duration-fast) var(--ease-out),
    width var(--duration-fast) var(--ease-out);
  width: 16px;
}

.pip:last-child {
  margin-right: 0;
}

.pip[data-active] {
  height: 21px;
  opacity: 1;
  position: relative;
  width: 21px;
  z-index: 1;
}

.crumbs {
  align-items: baseline;
  display: flex;
  font-size: 13px;
  gap: 7px;
  min-width: 0;
}

.session {
  color: var(--ink);
  font-weight: 600;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chev {
  color: var(--subtle);
  flex: none;
}

.artifact {
  color: var(--muted);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pos {
  color: var(--subtle);
  flex: none;
}

@media (prefers-reduced-motion: reduce) {
  .pip {
    transition: none;
  }
}
</style>
