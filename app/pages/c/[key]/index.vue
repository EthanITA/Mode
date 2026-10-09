<script lang="ts" setup>
import type { Component } from "vue";

const route = useRoute();
const sc = useSidecar();
const chrome = useChrome();
const follow = useFollow();

// Read off disk at build: an unbuilt face is unreachable, with no list kept by hand.
const parts = import.meta.glob<Component>(
  "../../../components/{board/island,files/view,history/view,review/view}.vue",
  { import: "default" },
);

function part(path: string): Component | undefined {
  const load = parts[`../../../components/${path}.vue`];
  return load && defineAsyncComponent(load);
}

const built: Record<Face, Component | undefined> = {
  files: part("files/view"),
  history: part("history/view"),
  review: part("review/view"),
};
const board = part("board/island");

chrome.view.faces.value = FACES.filter((face) => built[face]);

// A link such as `?face=review` picks the face once, then the switcher owns it.
const asked = FACES.find((face) => face === route.query.face);
if (asked) chrome.view.set(asked);

const key = computed(() => String(route.params.key ?? ""));
const session = computed(() => sc.sessions.value.find((s) => s.key === key.value));
const title = computed(() => (session.value ? nameOf(session.value) : key.value));
const face = computed(() => built[chrome.view.current.value]);
const gone = computed(() => sc.ready.value && !session.value);

// Re-asserted after every pull: the poll re-picks a session whenever the held key is unknown.
watch([key, () => sc.sessions.value], () => (sc.sessionKey.value = key.value), { immediate: true });

loadSidecar();
follow.listen();
</script>

<template>
  <NuxtLayout>
    <template #lead>
      <ChromeHead :cwd="session?.cwd" :title="title" />
    </template>

    <!-- Claude Code is the chat, so the dock carries only the notes waiting to go to it. -->
    <template #dock>
      <ComposerNotes v-if="!gone" />
    </template>

    <template #board>
      <component :is="board" v-if="board && !gone" />
    </template>

    <UiSurface v-if="gone" class="gone" pad="md" shape="island" variant="raised">
      <p class="gone-line">No conversation is running under <code>{{ key }}</code>.</p>
      <NuxtLink class="gone-back focusable" to="/">Listen for the next one</NuxtLink>
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

/* Every face owns its own scrolling panes, so the stage clips instead of scrolling them.
   The bottom follows the dock's measured height, whatever state the dock is in. */
.stage {
  box-sizing: border-box;
  overflow: hidden;
  padding: var(--stage-top) var(--gutter) calc(var(--dock-h, var(--dock-rest-h)) + var(--gutter) * 2);
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
