<script lang="ts" setup>
// Same-tab navigation would tear down the running session view, so every prose link leaves.
const { href, title } = defineProps<{ href?: string; title?: string }>();
</script>

<template>
  <a :href="href" rel="noopener noreferrer" target="_blank" :title="title"><slot /></a>
</template>
