<script lang="ts" setup>
const follow = $follow();
</script>

<template>
  <div class="veil" aria-hidden="true" data-region="follow-veil" :data-on="follow.isSwitching">
    <ClaudeMascot class="wait" :size="40" state="thinking" />
  </div>
</template>

<style scoped>
/* Hidden only once the fade-out ends, so lifting it is as smooth as covering. Under the toaster, so a notice still reads. */
.veil {
  @apply invisible fixed inset-0 z-45 grid place-items-center bg-canvas/72 opacity-0 backdrop-blur-md;
  transition:
    opacity var(--duration-base) var(--ease-out),
    visibility 0s linear var(--duration-base);
}

.veil[data-on="true"] {
  @apply visible opacity-100;
  transition:
    opacity var(--duration-fast) var(--ease-out),
    visibility 0s;
}

/* Only a slow page earns the loader, so a quick switch never flashes it. */
.wait {
  @apply opacity-0 transition-opacity duration-(--duration-fast) ease-out;
}

.veil[data-on="true"] .wait {
  @apply opacity-100 delay-(--duration-slow);
}
</style>
