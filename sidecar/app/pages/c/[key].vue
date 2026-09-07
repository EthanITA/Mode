<script lang="ts" setup>
import type { Component } from "vue";

const route = useRoute();
const sc = useSidecar();
const chrome = useChrome();

// Read off disk at build: an unbuilt face is unreachable, with no list kept by hand.
const parts = import.meta.glob<Component>(
  "../../components/{board/island,canvas/view,composer/dock,history/view,read/view}.vue",
  { import: "default" },
);

function part(path: string): Component | undefined {
  const load = parts[`../../components/${path}.vue`];
  return load && defineAsyncComponent(load);
}

const built: Record<Face, Component | undefined> = {
  canvas: part("canvas/view"),
  history: part("history/view"),
  read: part("read/view"),
};
const dock = part("composer/dock");
const board = part("board/island");

chrome.view.faces.value = FACES.filter((face) => built[face]);

const key = computed(() => String(route.params.key ?? ""));
const session = computed(() => sc.sessions.value.find((s) => s.key === key.value));
const title = computed(() => (session.value ? nameOf(session.value) : key.value));
const face = computed(() => built[chrome.view.current.value]);
const gone = computed(() => sc.ready.value && !session.value);

// Re-asserted after every pull: the poll re-picks a session whenever the held key is unknown.
watch([key, () => sc.sessions.value], () => (sc.sessionKey.value = key.value), { immediate: true });

loadSidecar();
</script>

<template>
  <div class="conversation">
    <ChromeHead :cwd="session?.cwd" :title="title" />

    <UiSurface v-if="gone" class="gone" pad="md" shape="island" variant="raised">
      <p class="gone-line">No conversation is running under <code>{{ key }}</code>.</p>
      <NuxtLink class="gone-back focusable" to="/">Back to the desk</NuxtLink>
    </UiSurface>

    <template v-else>
      <main class="stage" :data-face="chrome.view.current.value">
        <component :is="face" v-if="face" />
        <p v-else class="empty">
          No view has been built for this conversation yet.
        </p>
      </main>

      <component :is="dock" v-if="dock" />
      <component :is="board" v-if="board" />
    </template>

    <p v-if="sc.failure.value" class="failure" role="alert">
      The sidecar server did not answer: {{ sc.failure.value }}
    </p>
  </div>
</template>

<style scoped>
.conversation {
  background: var(--canvas);
  height: 100vh;
  position: relative;
}

.stage {
  inset: 0;
  position: absolute;
}

/* The canvas draws to the edges under the floating chrome; the panelled faces do not. */
.stage[data-face="history"],
.stage[data-face="read"] {
  padding: 72px 16px 96px;
}

.empty {
  color: var(--subtle);
  display: grid;
  font-size: 13px;
  height: 100%;
  margin: 0;
  place-items: center;
}

.gone {
  align-items: center;
  display: flex;
  gap: 14px;
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
}

.gone-line {
  color: var(--muted);
  font-size: 13px;
  margin: 0;
}

.gone-line code {
  color: var(--ink);
  font-family: var(--mono);
}

.gone-back {
  border-radius: 999px;
  color: var(--primary-deep);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.failure {
  background: var(--error-soft);
  border: 1px solid var(--error);
  border-radius: var(--radius-field);
  bottom: 16px;
  color: var(--error);
  font-size: 13px;
  left: 16px;
  margin: 0;
  padding: 9px 13px;
  position: fixed;
  z-index: 30;
}
</style>
