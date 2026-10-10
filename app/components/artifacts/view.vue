<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core";
import type { ArtifactKind, ArtifactMeta } from "~~/shared/types/artifact";

const SIDE = 340;
const KIND: Record<ArtifactKind, string> = { document: "Document", page: "Page", plan: "Plan" };

const side = useLocalStorage("sc:pane:artifacts", SIDE);
const sc = useSidecar();
const follow = useFollow();
const selected = useState<string | undefined>("ar:selected");

const session = computed(() => sc.sessions.value.find((s) => s.key === sc.sessionKey.value));
// A scratch .md the conversation wrote is a document, so it stays in Files with the rest of its files.
const entries = computed(() => {
  const mine = new Set(session.value?.artifacts ?? []);
  return sc.catalogue.value.filter((meta) => mine.has(meta.slug) && meta.kind !== "document");
});
// Any page the catalogue holds opens here, since Claude Code can point at one this conversation never made.
const picked = computed(() => sc.catalogue.value.find((meta) => meta.slug === selected.value));

watch(
  entries,
  () => {
    if (!selected.value) selected.value = entries.value[0]?.slug;
  },
  { immediate: true },
);

// A page made after the catalogue loaded is not in it yet, so the catalogue is read again before giving up.
watch(
  () => follow.opening.value,
  async (slug) => {
    if (!slug) return;
    const isKnown = (): boolean => sc.catalogue.value.some((meta) => meta.slug === slug);
    if (!isKnown()) sc.catalogue.value = await $fetch<ArtifactMeta[]>("/api/artifacts").catch(() => sc.catalogue.value);
    if (follow.opening.value !== slug) return;
    follow.opening.value = undefined;
    if (isKnown()) selected.value = slug;
  },
  { immediate: true },
);
</script>

<template>
  <section class="artifacts" data-region="artifacts" :style="{ '--side-w': `${side}px` }">
    <UiSurface class="pane" data-region="artifacts-list" pad="none" variant="raised">
      <header class="bar">
        <span class="title">Artifacts</span>
        <span class="meta mono-meta">{{ entries.length ? plural(entries.length, "item") : "" }}</span>
      </header>
      <div class="scroll">
        <UiStateMessage v-if="!sc.sessionKey.value" class="empty">No conversation is selected.</UiStateMessage>
        <UiStateMessage v-else-if="!entries.length" class="empty">
          This conversation hasn't made a page or a plan yet.
        </UiStateMessage>
        <button
          v-for="meta in entries"
          :key="meta.slug"
          v-press
          class="entry focusable plain-button"
          type="button"
          :data-selected="meta.slug === selected"
          data-cmt="artifact"
          :data-cmt-label="meta.title || deslug(meta.slug)"
          :data-cmt-tell="`On ${basename(meta.path)}`"
          @click="selected = meta.slug"
        >
          <span class="head">
            <span class="kind mono-meta" :data-kind="meta.kind">{{ KIND[meta.kind] }}</span>
            <span v-if="meta.updated" class="age mono-meta">{{ relativeAge(meta.updated) }}</span>
            <span class="spacer" />
            <span v-if="meta.threadCount" class="age mono-meta">{{ plural(meta.threadCount, "thread") }}</span>
          </span>
          <span class="name">{{ meta.title || deslug(meta.slug) }}</span>
        </button>
      </div>
    </UiSurface>

    <PaneResizer v-model="side" :initial="SIDE" label="Resize the artifact list" />

    <ArtifactSheet :conversation="sc.sessionKey.value" :path="picked?.path" :slug="picked?.slug">
      <UiStateMessage align="center" class="centered">Pick a page or a plan to open it here.</UiStateMessage>
    </ArtifactSheet>
  </section>
</template>

<style scoped>
/* The middle track is the resizer's; half the face caps a width remembered from a wider window. */
.artifacts {
  column-gap: 8px;
  display: grid;
  grid-template-columns: min(var(--side-w), 50%) 0 minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.bar {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 10px 14px;
}

.title {
  font-size: 12.5px;
  font-weight: 700;
}

.meta {
  color: var(--muted);
  text-transform: none;
}

.scroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px var(--float-clear);
}

.entry {
  border: 1px solid transparent;
  border-radius: 10px;
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  text-align: left;
  transition: background var(--duration-fast) var(--ease-out);
  width: 100%;
}

.entry:hover {
  background: var(--sunken);
}

.entry[data-selected="true"] {
  background: var(--sunken);
  border-color: var(--border-strong);
}

.head {
  align-items: center;
  display: flex;
  gap: 8px;
}

.spacer {
  flex: 1;
}

.kind {
  background: var(--sunken);
  border-radius: 999px;
  color: var(--muted);
  padding: 2px 7px;
  text-transform: none;
}

.kind[data-kind="plan"] {
  background: var(--primary-soft);
  color: var(--primary-deep);
}

.age {
  color: var(--subtle);
  text-transform: none;
}

.name {
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.entry[data-selected="true"] .name {
  color: var(--primary);
}

.empty {
  padding: 2px;
}

.centered {
  flex: 1;
  padding: 16px;
}
</style>
