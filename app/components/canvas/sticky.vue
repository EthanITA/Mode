<script lang="ts" setup>
import { Trash2 } from "@lucide/vue";
import type { CanvasNote } from "~~/shared/types/canvas";

const { note } = defineProps<{ note: CanvasNote }>();

const emit = defineEmits<{ remove: []; text: [value: string] }>();

const tell = computed(() =>
  note.text.trim() ? `On the note “${shorten(note.text, 48)}”` : "On the empty note on the canvas",
);
</script>

<template>
  <div
    :data-cmt-label="note.text.trim() || 'Empty note'"
    :data-cmt-tell="tell"
    class="sticky"
    data-cmt="note"
  >
    <UiTextarea
      :model-value="note.text"
      class="sticky-text"
      placeholder="Say it to Claude…"
      variant="bare"
      @update:model-value="emit('text', $event ?? '')"
    />
    <footer class="sticky-foot">
      <span class="mono-meta sticky-hint">note · rides your next turn</span>
      <button
        v-press
        class="plain-button focusable sticky-drop"
        title="Discard this note"
        type="button"
        @click="emit('remove')"
      >
        <UiIcon :icon="Trash2" size="xs" />
      </button>
    </footer>
  </div>
</template>

<style scoped>
.sticky {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.sticky-text {
  cursor: text;
  flex: 1;
  min-height: 0;
  padding: 12px 14px 4px;
}

.sticky-foot {
  align-items: center;
  display: flex;
  flex: none;
  gap: 8px;
  padding: 2px 8px 8px 14px;
}

.sticky-hint {
  color: var(--warning);
  flex: 1;
  letter-spacing: 0.06em;
}

.sticky-drop {
  border-radius: 999px;
  color: var(--muted);
  display: grid;
  flex: none;
  height: 22px;
  place-items: center;
  width: 22px;
}

.sticky-drop:hover {
  background: var(--sunken);
  color: var(--error);
}
</style>
