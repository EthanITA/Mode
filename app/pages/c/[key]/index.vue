<script lang="ts" setup>
import type { Component } from "vue";

const route = useRoute();
const sc = useSidecar();
const chrome = useChrome();
const follow = $follow();

// Read off disk at build: an unbuilt face is unreachable, with no list kept by hand.
const parts = import.meta.glob<Component>(
  "../../../components/{artifacts/view,files/view,history/view,review/view}.vue",
  { import: "default" },
);

function part(path: string): Component | undefined {
  const load = parts[`../../../components/${path}.vue`];
  return load && defineAsyncComponent(load);
}

const built: Record<Face, Component | undefined> = {
  artifacts: part("artifacts/view"),
  files: part("files/view"),
  history: part("history/view"),
  review: part("review/view"),
};

chrome.view.faces.value = FACES.filter((face) => built[face]);

// A link such as `?face=review` or `?artifact=<slug>` picks once, then the switcher owns it.
const asked = FACES.find((face) => face === route.query.face);
if (asked) chrome.view.set(asked);
if (typeof route.query.artifact === "string") {
  chrome.view.set("artifacts");
  follow.opening = route.query.artifact;
}

const key = computed(() => String(route.params.key ?? ""));
const session = computed(() => sc.sessions.value.find((s) => s.key === key.value));
const title = computed(() => (session.value ? nameOf(session.value) : key.value));
const face = computed(() => built[chrome.view.current.value]);
const gone = computed(() => sc.ready.value && !session.value);

// A live page reloads whenever its frame leaves the DOM, so Artifacts stays mounted behind the other faces once opened.
const isArtifacts = computed(() => chrome.view.current.value === "artifacts");
const keepsArtifacts = ref(false);
watch(
  isArtifacts,
  (on) => {
    if (on) keepsArtifacts.value = true;
  },
  { immediate: true },
);

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

    <UiSurface v-if="gone" class="gone" pad="md" shape="island" variant="raised">
      <p class="gone-line">
        No conversation is running under <code>{{ key }}</code
        >.
      </p>
      <NuxtLink class="gone-back focusable" to="/">Listen for the next one</NuxtLink>
    </UiSurface>

    <main v-else class="stage" data-region="conversation-stage" :data-face="chrome.view.current.value">
      <component :is="built.artifacts" v-if="built.artifacts && keepsArtifacts" v-show="isArtifacts" />
      <component :is="face" v-if="face && !isArtifacts" />
      <p v-else-if="!face" class="empty">No view has been built for this conversation yet.</p>
    </main>
  </NuxtLayout>
</template>

<style scoped>
/* Every face owns its own scrolling panes, so the stage clips instead of scrolling them.
   The board and the notes float over the panes, so the faces run to the bottom gutter
   and a pane's last row pads by --float-clear to stay clickable above them. */
.stage {
  @apply absolute inset-0 overflow-hidden px-(--gutter) pt-(--stage-top) pb-(--gutter);
  --float-clear: calc(max(var(--dock-h, 0px), var(--island-row-h)) + var(--gutter));
}

.empty {
  @apply m-0 grid h-full place-items-center typo-body text-subtle;
}

.gone {
  @apply absolute top-1/2 left-1/2 flex -translate-1/2 items-center gap-3.5;
}

.gone-line {
  @apply m-0 typo-body text-muted;
}

.gone-line code {
  @apply font-mono text-fg;
}

.gone-back {
  @apply rounded-full typo-body-strong whitespace-nowrap text-primary-deep;
}
</style>
