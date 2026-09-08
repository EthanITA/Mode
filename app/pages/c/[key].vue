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
  <NuxtLayout>
    <template #lead>
      <ChromeHead :cwd="session?.cwd" :title="title" />
    </template>

    <template #dock>
      <component :is="dock" v-if="dock && !gone" />
    </template>

    <template #board>
      <component :is="board" v-if="board && !gone" />
    </template>

    <UiSurface v-if="gone" class="gone" pad="md" shape="island" variant="raised">
      <p class="gone-line">No conversation is running under <code>{{ key }}</code>.</p>
      <NuxtLink class="gone-back focusable" to="/">Back to the desk</NuxtLink>
    </UiSurface>

    <main v-else class="stage" data-region="conversation-stage" :data-face="chrome.view.current.value">
      <component :is="face" v-if="face" />
      <p v-else class="empty">
        No view has been built for this conversation yet.
      </p>
    </main>
  </NuxtLayout>
</template>

<style scoped>
.stage {
  inset: 0;
  position: absolute;
}

/* The canvas draws to the edges under the floating chrome; the panelled faces do not. */
.stage[data-face="history"],
.stage[data-face="read"] {
  box-sizing: border-box;
  padding: var(--stage-top) var(--gutter) var(--stage-bottom);
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
</style>
