<script lang="ts" setup>
const follow = useFollow();

loadSidecar();
follow.listen({ isEager: true });

const waiting = computed(() =>
  follow.pinned.value
    ? "Pinned, so the sidecar stays here. Unpin to follow Claude Code."
    : "Run /sidecar in a Claude Code conversation, or type in one, and the sidecar focuses on it.",
);
</script>

<template>
  <NuxtLayout>
    <template #lead>
      <ChromeListening />
    </template>

    <main class="listening" data-region="listening-stage">
      <UiSurface class="card" pad="md" shape="island" variant="raised">
        <span class="dot" aria-hidden="true" />
        <p class="title">Listening to Claude Code session</p>
        <p class="hint">{{ waiting }}</p>
      </UiSurface>
    </main>
  </NuxtLayout>
</template>

<style scoped>
.listening {
  display: grid;
  inset: 0;
  place-items: center;
  position: absolute;
}

.card {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
  text-align: center;
}

.dot {
  background: var(--success);
  border-radius: 999px;
  height: 10px;
  width: 10px;
}

.title {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
}

.hint {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}
</style>
