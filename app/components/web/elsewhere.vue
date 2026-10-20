<script lang="ts" setup>
const sc = useSidecar();
const web = $web();

const address = computed(() => web.page?.url ?? sc.artifact.value?.url ?? "");
const away = computed(() => {
  const at = address.value && Web.elsewhere(sc.artifact.value?.threads ?? [], Web.addressOf(address.value))[0];
  return at ? { ...at, label: Web.shortOf(at.page, { from: address.value }) } : undefined;
});

function goAway(): void {
  if (away.value) web.visit(new URL(away.value.page));
}
</script>

<template>
  <UiButton
    v-if="away"
    class="elsewhere"
    data-tip="Go to the page the thread was left on"
    size="xs"
    variant="outline"
    @click="goAway"
  >
    {{ plural(away.count, "thread") }} on {{ away.label }}
  </UiButton>
</template>

<style scoped>
.elsewhere {
  @apply mr-1;
}

.elsewhere::before {
  @apply size-1.5 rounded-full bg-primary content-[''];
}
</style>
