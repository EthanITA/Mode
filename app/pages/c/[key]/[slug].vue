<script lang="ts" setup>
import { Check, RotateCcw } from "@lucide/vue";
import type { FrameHit, FrameMark, FramePending, FrameSelection } from "~/types/frame";
import type { DiffGap } from "~~/shared/types/versions";

type Stage = "live" | "reading" | "unreadable" | "version";

const GAP: Record<DiffGap, string> = {
  "missing-content": "no version of this file was stored for this turn",
  "skipped": "this file is not versioned — it was over the size budget",
  "store-failed": "the version store could not be read",
  "unknown-baseline": "what stood before this file was first touched could not be reconstructed",
  "unresolved-target": "there is no version of this file at the point being asked for",
};

const route = useRoute();
const sc = useSidecar();
const chrome = useChrome();
const { session } = useScreen();

const key = computed(() => String(route.params.key ?? ""));
const slug = computed(() => String(route.params.slug ?? ""));
const title = computed(() => sc.artifact.value?.title || deslug(slug.value));

const frame = ref<{ clearPick: () => void }>();
const marks = ref<FrameMark[]>([]);
const measured = ref(false);
const panel = ref<FrameSelection>();
const pendingEdits = ref<FramePending[]>([]);
const edition = ref(0);
const awaiting = ref(false);
const closedIds = new Set<string>();
const heldScroll = ref(false);
const heldTop = ref(0);
const frameReady = ref(false);
const noteCount = ref(0);
const inlineAsk = useState<boolean>("sc:inline-ask", () => false);
const inlineArmed = useState<boolean>("sc:inline-armed", () => false);

const path = computed(() => sc.artifact.value?.path);
const versions = useReadVersions({ path, sessionKey: sc.sessionKey });

const threads = computed(() => sc.artifact.value?.threads ?? []);
const live = computed(() => !versions.at.value);

const stage = computed<Stage>(() => {
  if (!versions.at.value) return "live";
  const got = versions.content.value;
  if (!got) return "reading";
  return got.found ? "version" : "unreadable";
});

const html = computed(() => {
  const got = versions.content.value;
  return got?.found ? got.content : undefined;
});

const gap = computed(() => {
  const got = versions.content.value;
  return got && !got.found ? GAP[got.reason] : "";
});

function onMarks(next: FrameMark[]): void {
  marks.value = next;
  measured.value = true;
}

function toSelection(hit: FrameHit): FrameSelection {
  return {
    bottom: hit.top + hit.height,
    left: hit.left + hit.width / 2,
    mark: { height: hit.height, key: hit.key, label: hit.label, text: hit.text, top: hit.top },
    path: hit.path,
    quote: hit.text,
    top: hit.top,
  };
}

function stageOf(): HTMLElement | undefined {
  let node = document.querySelector("[data-region='artifact-view']")?.parentElement ?? undefined;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement ?? undefined;
  }
  return (document.scrollingElement as HTMLElement | undefined) ?? undefined;
}

function holdScroll(): void {
  if (!heldScroll.value) {
    const root = stageOf();
    if (root) {
      heldScroll.value = true;
      heldTop.value = root.scrollTop;
    }
  }
  frameReady.value = false;
}

function tryRestore(): void {
  if (!heldScroll.value || !frameReady.value) return;
  const root = stageOf();
  if (root) root.scrollTop = heldTop.value;
  heldScroll.value = false;
}

function bump(): void {
  holdScroll();
  edition.value += 1;
}

function closeInline(): void {
  awaiting.value = false;
  panel.value = undefined;
  frame.value?.clearPick();
}

function takePending(next: FramePending[]): void {
  pendingEdits.value = next.filter((edit) => !closedIds.has(edit.id));
}

function onReady(): void {
  frameReady.value = true;
  tryRestore();
  awaiting.value = pendingEdits.value.length > 0;
}

// The comment popover and the edit panel both anchor to the pick, so only one may be open.
function openInline(): void {
  const hit = chrome.comment.pick.value;
  if (!hit) return;
  chrome.comment.close();
  panel.value = toSelection(hit);
}

function onApplied(): void {
  awaiting.value = true;
  bump();
}

function settleMessage(error: unknown): string {
  if (typeof error !== "object" || !error) return "That change could not be settled";
  const rec = error as { data?: unknown; statusMessage?: unknown };
  const data = rec.data;
  if (typeof data === "object" && data) {
    const body = data as { statusMessage?: unknown; message?: unknown };
    if (typeof body.statusMessage === "string" && body.statusMessage) return body.statusMessage;
    if (typeof body.message === "string" && body.message) return body.message;
  }
  if (typeof rec.statusMessage === "string" && rec.statusMessage) return rec.statusMessage;
  return "That change could not be settled";
}

async function settle(action: "accept" | "revert", edit: FramePending): Promise<void> {
  const slug = sc.slug.value;
  if (!slug) return;
  holdScroll();
  try {
    await $fetch(`/api/artifacts/${slug}/edit`, {
      body: { action, id: edit.id, path: edit.path },
      method: "POST",
    });
    closedIds.add(edit.id);
    pendingEdits.value = pendingEdits.value.filter((row) => row.id !== edit.id);
    if (!pendingEdits.value.length) closeInline();
    bump();
  } catch (error) {
    heldScroll.value = false;
    frameReady.value = true;
    chrome.toast(settleMessage(error), "destructive");
  }
}

watch([() => chrome.comment.pick.value, live], ([hit, on]) => {
  inlineArmed.value = Boolean(hit) && on;
});

watch(inlineAsk, (ask) => {
  if (!ask) return;
  inlineAsk.value = false;
  openInline();
});

// Re-asserted after every pull, like the conversation key: the poll re-picks a slug whenever the held one is unknown.
watch([key, slug, () => sc.sessions.value], () => {
  sc.sessionKey.value = key.value;
  sc.slug.value = slug.value;
}, { immediate: true });

loadSidecar();

watch([() => sc.slug.value, () => versions.at.value], () => {
  marks.value = [];
  measured.value = false;
  panel.value = undefined;
  pendingEdits.value = [];
  awaiting.value = false;
  closedIds.clear();
  // Armed from the button, comment mode is sticky and global; the document it was armed against is gone.
  chrome.comment.disarm();
});

function onWin(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  const [edit] = pendingEdits.value;
  if (!edit) return;
  event.preventDefault();
  void settle("revert", edit);
}

// `shelved` follows the conversation's face, and this route has no face to follow.
watchEffect(() => {
  chrome.islands.shelved.value = false;
});

onMounted(() => {
  window.addEventListener("keydown", onWin);
});

onScopeDispose(() => {
  window.removeEventListener("keydown", onWin);
  inlineArmed.value = false;
  chrome.comment.disarm();
});
</script>

<template>
  <NuxtLayout>
    <template #lead>
      <ArtifactHead :conversation="key" :title="title" />
    </template>

    <template #dock>
      <ComposerDock />
    </template>

    <main class="stage">
      <div class="page" data-region="artifact-view">
        <ArtifactVersions
          v-model="versions.at.value"
          :baseline="versions.baseline.value"
          :head="versions.head.value"
          :list="versions.list.value"
          :reading="versions.reading.value"
          :skipped="versions.skipped.value"
          :slug="slug"
          :unreachable="versions.unreachable.value"
        />

        <div v-if="sc.artifact.value?.slug === slug" class="stack" :data-notes="noteCount > 0">
          <ArtifactFrame
            v-if="stage === 'live' || stage === 'version'"
            ref="frame"
            class="sheet-cell"
            data-region="artifact-page"
            :edition="edition"
            :html="html"
            :slug="slug"
            :version="versions.at.value"
            @edit="openInline"
            @marks="onMarks"
            @pending="takePending"
            @ready="onReady"
          />

          <ArtifactGutter
            v-if="measured"
            class="notes-cell"
            side="right"
            :live="live"
            :marks="marks"
            :threads="threads"
            @notes="noteCount = $event"
            @reload="bump"
          />

          <div v-else class="gap" data-region="version-gap">
            <p v-if="stage === 'reading'" class="mono-meta">reading t{{ versions.at.value }}…</p>
            <template v-else>
              <p class="title">This version could not be read back.</p>
              <p class="why">{{ gap }}.</p>
              <p class="why">
                Nothing is drawn here rather than a blank page, which would read as though t{{ versions.at.value }} of
                <b>{{ slug }}</b> changed nothing.
              </p>
              <button v-press class="back focusable" type="button" @click="versions.at.value = undefined">
                Back to latest
              </button>
            </template>
          </div>

          <ArtifactInline
            v-if="panel"
            :held="awaiting || pendingEdits.length > 0"
            :live="live"
            :selection="panel"
            :slug="slug"
            @applied="onApplied"
            @done="closeInline"
          />

          <UiSurface
            v-for="edit in pendingEdits"
            :key="edit.id"
            class="settle"
            data-region="inline-panel"
            pad="none"
            variant="raised"
            :style="{ left: `${edit.left}px`, top: `${edit.top}px` }"
          >
            <UiIconButton :icon="Check" label="Keep the new text" size="xs" @click="settle('accept', edit)">
              Accept
            </UiIconButton>
            <UiIconButton :icon="RotateCcw" label="Restore the old text" size="xs" @click="settle('revert', edit)">
              Revert
            </UiIconButton>
          </UiSurface>
        </div>

        <div v-else class="blank">
          <p v-if="!sc.ready.value" class="mono-meta">reading {{ slug }}…</p>
          <p v-else-if="session && !session.artifacts.includes(slug)">
            <b>{{ slug }}</b> is not stamped against <b>{{ nameOf(session) }}</b>.
          </p>
          <p v-else>
            <b>{{ slug }}</b> could not be read from the artifacts directory.
          </p>
          <NuxtLink class="back focusable" :to="`/c/${key}`">Back to the conversation</NuxtLink>
        </div>
      </div>
    </main>
  </NuxtLayout>
</template>

<style scoped>
/* The page owns the scroll — the frame inside it is sized to its content and never scrolls itself. */
.stage {
  box-sizing: border-box;
  inset: 0;
  overflow-y: auto;
  padding: var(--stage-top) 0 calc(var(--dock-h, var(--dock-rest-h)) + var(--gutter) * 2);
  position: absolute;
}

.page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  width: 100%;
}

/* Two columns: a note narrows the artifact rather than covering it. */
.stack {
  column-gap: 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 0;
  position: relative;
  transition: grid-template-columns var(--duration-base) var(--ease-out);
}

.stack[data-notes="true"] {
  grid-template-columns: minmax(0, 1fr) var(--notes-w);
  padding-right: var(--gutter);
}

/* Named rather than left to source order: the overlays between them are out of flow. */
.sheet-cell,
.gap {
  grid-column: 1;
}

.notes-cell {
  grid-column: 2;
}

/* Only the artifact runs to the edges; its chrome insets itself. */
.page > :deep([data-region="version-tabs"]) {
  box-sizing: border-box;
  margin-inline: auto;
  max-width: var(--page-w);
  padding-inline: var(--gutter);
  width: 100%;
}

.gap,
.blank {
  background: var(--raised);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-box);
  box-sizing: border-box;
  color: var(--muted);
  font-size: 14px;
  margin-inline: auto;
  max-width: var(--page-w);
  padding: 40px 28px;
  text-align: center;
  width: 100%;
}

.gap p,
.blank p {
  margin: 0;
}

.gap p + p {
  margin-top: 8px;
}

.title {
  color: var(--ink);
  font-weight: 600;
}

.why {
  text-wrap: pretty;
}

.back {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  margin-top: 14px;
  padding: 6px 12px;
  text-decoration: none;
}

.back:hover {
  border-color: var(--ink);
}

.settle {
  align-items: center;
  display: inline-flex;
  gap: 2px;
  padding: 2px 4px;
  position: absolute;
  transform: translate(8px, -50%);
  z-index: 28;
}

@media (prefers-reduced-motion: reduce) {
  .stack {
    transition: none;
  }
}
</style>
