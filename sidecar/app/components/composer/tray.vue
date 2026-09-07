<script lang="ts" setup>
import { X } from "@lucide/vue";

const tray = useTray();
</script>

<template>
  <div v-if="tray.count.value" class="tray" data-region="composer-tray">
    <span
      v-for="item in tray.items.value"
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
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 6px;
}

.chip {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
  display: inline-flex;
  font-size: 12px;
  gap: 8px;
  height: 30px;
  max-width: 420px;
  padding: 0 4px 0 12px;
}

.kind {
  color: var(--primary);
  flex: none;
}

.chip[data-kind="task"] .kind {
  color: var(--warning);
}

.what {
  color: var(--ink);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quote {
  color: var(--muted);
}
</style>
