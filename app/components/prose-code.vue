<script lang="ts" setup>
const { language } = defineProps<{ language?: string }>();
const slots = useSlots();

// The fence's raw text sits in `code`'s array children, since comark renders nothing inside a fence as markdown.
const text = computed(() => {
  const [node] = slots.default?.() ?? [];
  const children = node?.children;
  return Array.isArray(children) ? children.filter((one) => typeof one === "string").join("") : "";
});
const html = ref<string>();

watch(
  text,
  async (value) => {
    html.value = await Syntax.code(value, language);
  },
  { immediate: true },
);
</script>

<template>
  <pre><code v-if="html" v-html="html" /><code v-else>{{ text }}</code></pre>
</template>
