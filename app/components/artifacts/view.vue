<script lang="ts" setup>
import { Trash2 } from "@lucide/vue";
import type { ArtifactMeta } from "~~/shared/types/artifact";

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

// A link or Claude asked for the artifact already open, maybe on another page, which its record now names.
async function showAgain(slug: string): Promise<void> {
  const meta = sc.catalogue.value.find((one) => one.slug === slug);
  if (meta?.kind !== "web") return;
  const got = await $fetch<ArtifactMeta>(`/api/artifacts/${slug}`).catch(() => undefined);
  const at = web.page?.url;
  if (got?.url && selected.value === slug && (!at || Web.addressOf(got.url) !== Web.addressOf(at)))
    web.visit(new URL(got.url));
}

// A page made after the catalogue loaded is not in it yet, so the catalogue is read again before giving up.
watch(
  () => follow.opening,
  async (slug) => {
    if (!slug) return;
    const isKnown = (): boolean => sc.catalogue.value.some((meta) => meta.slug === slug);
    if (!isKnown()) sc.catalogue.value = await $fetch<ArtifactMeta[]>("/api/artifacts").catch(() => sc.catalogue.value);
    if (follow.opening !== slug) return;
    follow.opening = undefined;
    if (slug === selected.value) void showAgain(slug);
    if (isKnown()) selected.value = slug;
  },
  { immediate: true },
);

const web = $web();
const artifact = $artifact();
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
  } catch {
    refused.value = "The sidecar could not open that. Try again in a moment.";
  } finally {
    isOpening.value = false;
  }
}
</script>

<template>
  <section class="artifacts" data-region="artifacts" :style="{ '--side-w': `${side}px` }">
    <UiSurface
      class="pane"
      data-region="artifacts-list"
      :data-listed="artifact.isFull && artifact.isListed"
      pad="none"
      variant="raised"
    >
      <header class="bar">
        <div class="row">
          <span class="title">Artifacts</span>
          <span class="meta mono-meta">{{ entries.length ? plural(entries.length, "item") : "" }}</span>
        </div>
        <form
          class="open"
          data-region="open-url"
          data-tip="An address or a search opens live here, as a tab of its own · {enter}"
          :data-focused="isFocused"
          :data-refused="!!refused"
          @submit.prevent="openUrl"
        >
          <WebFavicon class="globe" :address="address" />
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
            class="entry plain-button focusable"
            type="button"
            :data-selected="meta.slug === selected"
            data-cmt="artifact"
            :data-cmt-label="nameOf(meta)"
            :data-cmt-tell="`On ${basename(meta.path)}`"
            @click="selected = meta.slug"
          >
            <span class="head">
              <ArtifactsKindIcon :meta="meta" :page="meta.slug === selected ? web.page : undefined" />
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
  @apply grid h-full min-h-0 grid-cols-pane gap-x-2;
}

.pane {
  @apply flex min-h-0 flex-col overflow-hidden;
}

/* Over the grown sheet's left edge, under its islands, so another artifact opens without leaving fullscreen. */
.pane[data-listed="true"] {
  @apply fixed top-14 bottom-2 left-2 z-28 w-80;
}

.bar {
  @apply flex flex-none flex-col gap-2.5 border-b border-b-border px-3.5 pt-2.5 pb-3;
}

.row {
  @apply flex items-center gap-2;
}

.open {
  @apply m-0 flex h-8.5 cursor-text items-center gap-2 rounded-2xl border border-border bg-sunken px-3 py-0 transition duration-(--duration-fast) ease-out;
}

.open[data-focused="true"] {
  @apply border-primary ring-2 ring-primary-soft;
}

.open[data-refused="true"] {
  @apply border-error ring-2 ring-error-soft;
}

.globe {
  @apply flex-none text-subtle;
}

.open[data-focused="true"] .globe {
  @apply text-muted;
}

.open[data-refused="true"] .globe {
  @apply text-error;
}

.field {
  @apply min-w-0 flex-1 border-0 bg-transparent p-0 typo-body text-fg outline-none;
}

.field::placeholder {
  @apply text-subtle;
}

.hint {
  @apply mx-0 -mt-1 mb-0 px-1 py-0 typo-caption leading-normal text-pretty text-muted;
}

.hint[data-tone="error"] {
  @apply text-error;
}

.title {
  @apply typo-body-strong font-bold;
}

.meta {
  @apply text-muted normal-case;
}

.scroll {
  @apply flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-1.5 pb-(--float-clear);
}

.item {
  @apply relative flex-none;
  --row-bg: var(--raised);
}

.item:hover,
.item:has(.entry[data-selected="true"]) {
  --row-bg: var(--sunken);
}

/* Laid over the row's right end like the review tree's actions, so the text runs under it and never rewraps. */
.actions {
  @apply pointer-events-none absolute inset-y-px right-px left-auto flex items-center rounded-l-none rounded-r-field bg-linear-to-r from-transparent to-(--row-bg) to-[18px] py-0 pr-2 pl-4.5 opacity-0 transition-opacity duration-(--duration-fast) ease-out;
}

.item:hover .actions,
.item:focus-within .actions {
  @apply opacity-100;
}

.item:hover .pill,
.item:focus-within .pill {
  @apply pointer-events-auto;
}

/* The review tree's approve and reject pill, so removing reads like the other row decisions. */
.pill {
  @apply inline-flex items-center rounded-full border border-border-strong bg-raised p-px transition-colors duration-(--duration-fast) ease-out;
}

.dot {
  @apply grid h-4 w-5 cursor-pointer items-center justify-items-center rounded-full border-0 bg-transparent bg-none p-0 text-muted transition-colors duration-(--duration-fast) ease-out;
}

@media (hover: hover) and (pointer: fine) {
  .pill:hover {
    @apply border-error bg-error;
  }

  .pill:hover .dot {
    @apply text-error-content;
  }
}

.entry {
  @apply flex w-full flex-col gap-1.5 rounded-field border border-transparent px-3 py-2.5 text-left transition-colors duration-(--duration-fast) ease-out;
}

/* On the item, so the row keeps its hover while the pointer sits on the pill laid over it. */
.item:hover .entry {
  @apply bg-sunken;
}

.entry[data-selected="true"] {
  @apply border-border-strong bg-sunken;
}

.head {
  @apply flex items-center gap-2;
}

.age {
  @apply text-subtle normal-case;
}

.name {
  @apply line-clamp-2 typo-body-strong leading-snug wrap-break-word text-fg;
}

.entry[data-selected="true"] .name {
  @apply text-primary;
}

.empty {
  @apply p-0.5;
}

.centered {
  @apply flex-1 p-4;
}
</style>
