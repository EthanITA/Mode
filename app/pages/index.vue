<script lang="ts" setup>
loadSidecar();
useFollow().listen({ isEager: true });
</script>

<template>
  <NuxtLayout>
    <ListeningScreen />
  </NuxtLayout>
</template>
