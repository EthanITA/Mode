<script lang="ts" setup>
loadSidecar();
$follow().listen({ isEager: true });
</script>

<template>
  <NuxtLayout>
    <ListeningScreen />
  </NuxtLayout>
</template>
