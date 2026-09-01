<script lang="ts" setup></script>

<template>
  <NuxtLayout name="folio">
    <template #rail>
      <StateSessionRail />
    </template>
    <template #shelf>
      <ArtifactsShelf />
    </template>
    <template #threads>
      <ArtifactsThreads />
    </template>
  </NuxtLayout>
</template>
