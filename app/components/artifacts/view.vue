<script lang="ts" setup>
import { Globe, Trash2 } from "@lucide/vue";
import type { ArtifactKind, ArtifactMeta } from "~~/shared/types/artifact";

const KIND: Record<ArtifactKind, string> = {
  document: "Document",
  file: "File",
  page: "Page",
  plan: "Plan",
  web: "Web",
};

const { initial: sideInitial, width: side } = usePaneWidth();
const sc = useSidecar();
const chrome = useChrome();
const follow = $follow();
const selected = useConversationPick("ar:picks");

const shown = computed(() => chrome.view.current.value === "artifacts");
provide(FACE_SHOWN, shown);

// Comment mode was armed against the page this face holds, which stays mounted out of sight.
watch(shown, (on) => {
  if (!on) chrome.comment.disarm();
});

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
  () => follow.opening,
  async (slug) => {
    if (!slug) return;
    const isKnown = (): boolean => sc.catalogue.value.some((meta) => meta.slug === slug);
    if (!isKnown()) sc.catalogue.value = await $fetch<ArtifactMeta[]>("/api/artifacts").catch(() => sc.catalogue.value);
    if (follow.opening !== slug) return;
    follow.opening = undefined;
    if (isKnown()) selected.value = slug;
  },
  { immediate: true },
);

const web = $web();
const address = ref("");
const refused = ref<string>();
const isFocused = ref(false);
const isOpening = ref(false);

const hostOf = (meta: ArtifactMeta): string => (meta.url ? new URL(meta.url).host : "");
const nameOf = (meta: ArtifactMeta): string => meta.title || deslug(meta.slug);

function removeTip({ threadCount = 0 }: ArtifactMeta): string {
  if (!threadCount) return "Remove it · {cmd backspace}";
  return threadCount === 1
    ? "Remove it and its thread · {cmd backspace}"
    : `Remove it and its ${threadCount} threads · {cmd backspace}`;
}

// The entry open in the sheet was removed, wherever that happened, so the sheet moves to the next one.
watch(picked, (now, before) => {
  if (before && !now && before.slug === selected.value) selected.value = entries.value[0]?.slug;
});

async function openUrl(): Promise<void> {
  const url = address.value.trim();
  const key = sc.sessionKey.value;
  if (!url || !key || isOpening.value) return;
  isOpening.value = true;
  refused.value = undefined;
  try {
    selected.value = (await web.open(url)).slug;
    address.value = "";
  } catch (error) {
    refused.value =
      (error as { statusCode?: number }).statusCode === 400
        ? "Only http and https addresses open here, such as localhost:3000 or docs.mode.dev."
        : "The sidecar could not open that address. Try again in a moment.";
  } finally {
    isOpening.value = false;
  }
}
</script>

<template>
  <section class="artifacts" data-region="artifacts" :style="{ '--side-w': `${side}px` }">
    <UiSurface class="pane" data-region="artifacts-list" pad="none" variant="raised">
      <header class="bar">
        <div class="row">
          <span class="title">Artifacts</span>
          <span class="meta mono-meta">{{ entries.length ? plural(entries.length, "item") : "" }}</span>
        </div>
        <form
          class="open"
          data-region="open-url"
          data-tip="Any website or app on this machine opens live here · {enter}"
          :data-focused="isFocused"
          :data-refused="!!refused"
          @submit.prevent="openUrl"
        >
          <UiIcon class="globe" :icon="Globe" size="xs" />
          <input
            v-model="address"
            aria-label="Open a URL"
            autocomplete="off"
            class="field"
            inputmode="url"
            placeholder="Open a URL"
            spellcheck="false"
            type="text"
            :aria-invalid="!!refused"
            :disabled="isOpening || !sc.sessionKey.value"
            @blur="isFocused = false"
            @focus="isFocused = true"
            @input="refused = undefined"
          />
        </form>
        <p v-if="refused" class="hint" data-tone="error" role="alert">{{ refused }}</p>
        <p v-else-if="isFocused && address.trim()" class="hint">Opens live here, with the comment layer.</p>
      </header>
      <div class="scroll">
        <UiStateMessage v-if="!sc.sessionKey.value" class="empty">No conversation is selected.</UiStateMessage>
        <UiStateMessage v-else-if="!entries.length" class="empty">
          This conversation hasn't made a page or a plan yet.
        </UiStateMessage>
        <div
          v-for="meta in entries"
          :key="meta.slug"
          class="item"
          data-region="artifact-row"
          :data-kind="meta.kind"
          :data-slug="meta.slug"
        >
          <button
            v-press
            class="entry focusable plain-button"
            type="button"
            :data-selected="meta.slug === selected"
            data-cmt="artifact"
            :data-cmt-label="nameOf(meta)"
            :data-cmt-tell="`On ${basename(meta.path)}`"
            @click="selected = meta.slug"
          >
            <span class="head">
              <span class="kind mono-meta" :data-kind="meta.kind">{{ KIND[meta.kind] }}</span>
              <span v-if="meta.kind === 'web'" class="age mono-meta">{{ hostOf(meta) }}</span>
              <span v-else-if="meta.updated" class="age mono-meta">{{ relativeAge(meta.updated) }}</span>
            </span>
            <span class="name">{{ nameOf(meta) }}</span>
          </button>
          <span v-if="meta.kind === 'web' || meta.kind === 'file'" class="actions">
            <span class="pill">
              <button
                class="dot focusable"
                type="button"
                data-region="remove-entry"
                :aria-label="`Remove ${nameOf(meta)} from Artifacts`"
                :data-tip="removeTip(meta)"
                @click="web.remove(meta)"
              >
                <UiIcon :icon="Trash2" size="xs" />
              </button>
            </span>
          </span>
        </div>
      </div>
    </UiSurface>

    <PaneResizer v-model="side" :initial="sideInitial" label="Resize the artifact list" />

    <ArtifactSheet :conversation="sc.sessionKey.value" :kind="picked?.kind" :path="picked?.path" :slug="picked?.slug">
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
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 10px;
  padding: 10px 14px 12px;
}

.row {
  align-items: center;
  display: flex;
  gap: 8px;
}

.open {
  align-items: center;
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-sizing: border-box;
  cursor: text;
  display: flex;
  gap: 8px;
  height: 34px;
  margin: 0;
  padding: 0 12px;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
}

.open[data-focused="true"] {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.open[data-refused="true"] {
  border-color: var(--error);
  box-shadow: 0 0 0 2px var(--error-soft);
}

.globe {
  color: var(--subtle);
  flex: none;
}

.open[data-focused="true"] .globe {
  color: var(--muted);
}

.open[data-refused="true"] .globe {
  color: var(--error);
}

.field {
  background: transparent;
  border: 0;
  color: var(--ink);
  flex: 1;
  font: inherit;
  font-size: 13px;
  min-width: 0;
  outline: none;
  padding: 0;
}

.field::placeholder {
  color: var(--subtle);
}

.hint {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
  margin: -4px 0 0;
  padding: 0 4px;
  text-wrap: pretty;
}

.hint[data-tone="error"] {
  color: var(--error);
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

.item {
  --row-bg: var(--raised);
  flex: none;
  position: relative;
}

.item:hover,
.item:has(.entry[data-selected="true"]) {
  --row-bg: var(--sunken);
}

/* Laid over the row's right end like the review tree's actions, so the text runs under it and never rewraps. */
.actions {
  align-items: center;
  background: linear-gradient(to right, transparent, var(--row-bg) 18px);
  border-radius: 0 9px 9px 0;
  display: flex;
  inset: 1px 1px 1px auto;
  opacity: 0;
  padding: 0 8px 0 18px;
  pointer-events: none;
  position: absolute;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.item:hover .actions,
.item:focus-within .actions {
  opacity: 1;
}

.item:hover .pill,
.item:focus-within .pill {
  pointer-events: auto;
}

/* The review tree's approve and reject pill, so removing reads like the other row decisions. */
.pill {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  display: inline-flex;
  padding: 1px;
  transition:
    background var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.dot {
  align-items: center;
  background: none;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: grid;
  height: 16px;
  justify-items: center;
  padding: 0;
  transition: color var(--duration-fast) var(--ease-out);
  width: 20px;
}

@media (hover: hover) and (pointer: fine) {
  .pill:hover {
    background: var(--error);
    border-color: var(--error);
  }

  .pill:hover .dot {
    color: var(--error-content);
  }
}

.entry {
  border: 1px solid transparent;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  text-align: left;
  transition: background var(--duration-fast) var(--ease-out);
  width: 100%;
}

/* On the item, so the row keeps its hover while the pointer sits on the pill laid over it. */
.item:hover .entry {
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

.kind[data-kind="web"] {
  background: var(--info-soft);
  color: var(--info);
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
