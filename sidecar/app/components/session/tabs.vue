<script lang="ts" setup>
const sc = useSidecar();
const { tabs } = useScreen();
</script>

<template>
  <nav class="rail" data-region="session-tabs" aria-label="Live conversations">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tab focusable"
      type="button"
      :data-active="tab.key === sc.sessionKey.value ? '' : undefined"
      :data-tint="tab.tint"
      :aria-current="tab.key === sc.sessionKey.value ? 'true' : undefined"
      @click="sc.sessionKey.value = tab.key"
    >
      <span class="dot" :data-live="tab.live ? '' : undefined" />
      <span class="name">{{ tab.name }}</span>
      <span v-if="tab.key === sc.sessionKey.value" class="cwd mono-meta">{{ tab.cwd }}</span>
      <span v-if="tab.waiting" class="waiting mono-meta">waiting</span>
    </button>

    <button
      class="add focusable plain-button"
      type="button"
      disabled
      title="Read only: the sidecar watches conversations, it cannot start one"
      aria-label="Start a conversation (unavailable: the sidecar is read only)"
    >
      +
    </button>

    <span v-if="!tabs.length" class="empty">No conversation is running. Start one and its tab appears here.</span>

    <span class="spacer" />
    <UiThemeToggle />
  </nav>
</template>

<style scoped>
.rail {
  align-items: flex-end;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 2px;
  height: var(--rail-h);
  overflow-x: auto;
  padding: 0 12px;
  scrollbar-width: none;
}

.spacer {
  flex: 1;
}

/* The toggle is fixed by the Cela sheet; inside the rail it is just another control. */
.rail :deep(.theme-toggle) {
  align-self: center;
  height: 28px;
  position: static;
  width: 28px;
}

.tab {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--radius-field) var(--radius-field) 0 0;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 13px;
  gap: 7px;
  max-width: 340px;
  padding: 7px 12px 8px;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    padding var(--duration-fast) var(--ease-out);
}

.tab:hover {
  background: var(--sunken);
  color: var(--ink);
}

/* Raised and forward of the rest, the way a folder tab sits. */
.tab[data-active] {
  background: var(--raised);
  border-color: var(--border);
  box-shadow: 0 -2px 6px -2px rgb(0 0 0 / 8%);
  color: var(--ink);
  font-weight: 600;
  margin-bottom: -1px;
  padding-bottom: 10px;
}

.tab .dot {
  background: var(--tint);
  opacity: 0.45;
}

.tab .dot[data-live] {
  opacity: 1;
}

.tab[data-active] .dot {
  --dot-size: 8px;
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--tint) 22%, transparent);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* A path is case sensitive, so it never takes the mono-meta uppercase. */
.cwd {
  color: var(--subtle);
  flex: none;
  text-transform: none;
}

.waiting {
  background: var(--warning-soft);
  border-radius: 999px;
  color: var(--warning);
  flex: none;
  padding: 2px 6px;
}

.add {
  color: var(--subtle);
  font-size: 16px;
  line-height: 1;
  opacity: 0.5;
  padding: 6px 10px 10px;
}

.empty {
  color: var(--subtle);
  font-size: 13px;
  padding: 0 8px 10px;
}

@media (prefers-reduced-motion: reduce) {
  .tab {
    transition: none;
  }
}
</style>
