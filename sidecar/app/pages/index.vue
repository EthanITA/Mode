<script lang="ts" setup>
const sc = useSidecar();

loadSidecar();

function open(key: string): void {
  sc.sessionKey.value = key;
  navigateTo(`/c/${key}`);
}
</script>

<template>
  <NuxtLayout>
    <template #lead>
      <DeskHead />
    </template>

    <DeskGrid @open="open" />
  </NuxtLayout>
</template>
