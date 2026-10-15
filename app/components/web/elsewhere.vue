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
  <button
    v-if="away"
    v-press
    class="elsewhere focusable"
    type="button"
    data-tip="Go to the page the thread was left on"
    @click="goAway"
  >
    {{ plural(away.count, "thread") }} on {{ away.label }}
  </button>
</template>

<style scoped>
.elsewhere {
  @apply mr-1 inline-flex h-6.5 flex-none cursor-pointer items-center gap-1.5 rounded-full border border-border bg-sunken px-2.5 text-[11.5px] font-semibold whitespace-nowrap text-muted;
}

.elsewhere::before {
  @apply size-1.5 rounded-full bg-primary content-[''];
}

.elsewhere:hover {
  @apply text-fg;
}
</style>
