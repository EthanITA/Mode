<script lang="ts" setup>
import { Pin, PinOff } from "@lucide/vue";

const follow = useFollow();

const label = computed(() => (follow.pinned.value ? "Pinned to this conversation" : "Listening to Claude Code session"));
const hint = computed(() => {
  const target = follow.target.value;
  if (follow.pinned.value) return "Unpin to follow Terminal again";
  if (target.source === "terminal") return `Terminal's front tab: ${target.name ?? target.key}`;
  if (target.source === "prompt") return `Where you last typed: ${target.name ?? target.key}`;
  return "No Terminal tab is a Claude Code conversation yet";
});
</script>

<template>
  <UiSurface class="pill" data-region="listening" pad="none" shape="pill" variant="glass" :title="hint">
    <span class="dot" :data-pinned="follow.pinned.value" aria-hidden="true" />
    <span class="label">{{ label }}</span>
    <button
      v-press
      class="pin focusable"
      type="button"
      :aria-pressed="follow.pinned.value"
      :aria-label="follow.pinned.value ? 'Follow Terminal again' : 'Stay on this conversation'"
      @click="follow.pinned.value = !follow.pinned.value"
    >
      <UiIcon :icon="follow.pinned.value ? PinOff : Pin" size="sm" />
    </button>
  </UiSurface>
</template>

<style scoped>
.pill {
  align-items: center;
  display: flex;
  flex: none;
  gap: 8px;
  height: var(--island-row-h);
  padding: 0 6px 0 14px;
}

.dot {
  background: var(--success);
  border-radius: 999px;
  flex: none;
  height: 7px;
  width: 7px;
}

.dot[data-pinned="true"] {
  background: var(--primary);
}

.label {
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.pin {
  background: none;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: grid;
  height: 26px;
  place-items: center;
  width: 26px;
}

.pin:hover,
.pin[aria-pressed="true"] {
  color: var(--primary-deep);
}
</style>
