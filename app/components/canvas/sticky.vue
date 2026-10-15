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
  <div :data-cmt-label="note.text.trim() || 'Empty note'" :data-cmt-tell="tell" class="sticky" data-cmt="note">
    <UiTextarea
      :model-value="note.text"
      class="sticky-text"
      placeholder="Say it to Claude…"
      variant="bare"
      @update:model-value="emit('text', $event ?? '')"
    />
    <footer class="sticky-foot">
      <span class="sticky-hint mono-meta">note · rides your next turn</span>
      <button
        v-press
        class="sticky-drop plain-button focusable"
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
  @apply flex h-full flex-col overflow-hidden;
}

.sticky-text {
  @apply min-h-0 flex-1 cursor-text px-3.5 pt-3 pb-1;
}

.sticky-foot {
  @apply flex flex-none items-center gap-2 pt-0.5 pr-2 pb-2 pl-3.5;
}

.sticky-hint {
  @apply flex-1 tracking-wider text-warning;
}

.sticky-drop {
  @apply grid size-5.5 flex-none place-items-center rounded-full text-muted;
}

.sticky-drop:hover {
  @apply bg-sunken text-error;
}
</style>
