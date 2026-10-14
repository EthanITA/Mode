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
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  background: color-mix(in oklch, var(--canvas) 72%, transparent);
  display: grid;
  inset: 0;
  opacity: 0;
  place-items: center;
  position: fixed;
  transition:
    opacity var(--duration-base) var(--ease-out),
    visibility 0s linear var(--duration-base);
  visibility: hidden;
  z-index: 45;
}

.veil[data-on="true"] {
  opacity: 1;
  transition:
    opacity var(--duration-fast) var(--ease-out),
    visibility 0s;
  visibility: visible;
}

/* Only a slow page earns the loader, so a quick switch never flashes it. */
.wait {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.veil[data-on="true"] .wait {
  opacity: 1;
  transition-delay: var(--duration-slow);
}
</style>
