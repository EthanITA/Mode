<script lang="ts" setup>
const { href, title } = defineProps<{ href?: string; title?: string }>();
</script>

<template>
  <!-- Same-tab navigation would tear down the running session view, so every prose link leaves. -->
  <a :href="href" rel="noopener noreferrer" target="_blank" :title="title"><slot /></a>
</template>
