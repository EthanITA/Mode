<script lang="ts" setup>
const { language } = defineProps<{ language?: string }>();
const slots = useSlots();

// A fenced code block is one literal text child, never inline markdown: `code.children` is the raw string.
const text = computed(() => {
  const [node] = slots.default?.() ?? [];
  return typeof node?.children === "string" ? node.children : "";
});
const html = ref<string>();

watch(text, async (value) => { html.value = await Syntax.code(value, language); }, { immediate: true });
</script>

<template>
  <pre><code v-if="html" v-html="html" /><code v-else>{{ text }}</code></pre>
</template>
