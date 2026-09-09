<script lang="ts" setup>
const {
  disabled = false,
  placeholder = "Reply…",
} = defineProps<{
  disabled?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{ save: [text: string] }>();

const draft = defineModel<string>({ default: "" });
const box = ref<{ $el: HTMLTextAreaElement }>();

function submit(): void {
  const text = draft.value.trim();
  if (!text || disabled) return;
  emit("save", text);
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  submit();
}

defineExpose({ focus: (): void => box.value?.$el.focus() });
</script>

<template>
  <div class="compose" data-region="read-compose">
    <UiTextarea
      ref="box"
      v-model="draft"
      auto-fit
      :disabled="disabled"
      :placeholder="placeholder"
      :rows="2"
      @keydown="onKey"
    />
  </div>
</template>

<style scoped>
.compose {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
