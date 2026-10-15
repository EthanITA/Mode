<script lang="ts" setup>
import { Check, RotateCcw } from "@lucide/vue";
import type { FrameHit, FrameMark, FramePending, FrameSelection } from "~/types/frame";
import type { DiffGap } from "~~/shared/types/versions";

type Stage = "live" | "reading" | "unreadable" | "version";

const { conversation, slug } = defineProps<{ conversation: string; slug: string }>();

const GAP: Record<DiffGap, string> = {
  "missing-content": "no version of this file was stored for this turn",
  skipped: "this file is not versioned — it was over the size budget",
  "store-failed": "the version store could not be read",
  "unknown-baseline": "what stood before this file was first touched could not be reconstructed",
  "unresolved-target": "there is no version of this file at the point being asked for",
};

const sc = useSidecar();
const chrome = useChrome();
const sides = $sideQuestion();
const shown = useFaceShown();

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
const inlineAsk = useState<boolean>("sc:inline-ask", () => false);
const inlineArmed = useState<boolean>("sc:inline-armed", () => false);

const path = computed(() => sc.artifact.value?.path);
const threads = computed(() => sc.artifact.value?.threads ?? []);
const markdown = computed(() => sc.artifact.value?.format === "md");
const versions = useReadVersions({ path, sessionKey: sc.sessionKey, diffable: markdown });
const live = computed(() => !versions.at.value);
// A stored .md version is raw text, so the render route draws it rather than srcdoc.
const versionSrc = computed(() =>
  markdown.value && versions.at.value
    ? `/artifact/${slug}?session=${encodeURIComponent(conversation)}&turn=${versions.at.value}`
    : undefined,
);
const createdVersion = computed(() => versions.list.value.find((one) => one.turn === versions.at.value)?.created);
// A .md a turn created has nothing to diff against, so it keeps the full rendered view.
const showDiff = computed(() => markdown.value && !!versions.at.value && !createdVersion.value);

const stage = computed<Stage>(() => {
  if (!versions.at.value) return "live";
  if (showDiff.value) return versions.diffState.value ? "version" : "reading";
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
    mark: {
      height: hit.height,
      key: hit.key,
      label: hit.label,
      left: hit.left,
      text: hit.text,
      top: hit.top,
      width: hit.width,
    },
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
  if (!hit || markdown.value) return;
  chrome.comment.close();
  panel.value = toSelection(hit);
}

function onApplied(): void {
  awaiting.value = true;
  bump();
}

async function settle(action: "accept" | "revert", edit: FramePending): Promise<void> {
  const held = sc.slug.value;
  if (!held) return;
  holdScroll();
  try {
    await $fetch(`/api/artifacts/${held}/edit`, {
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
    chrome.toast(failReason(error) ?? "That change could not be settled", "destructive");
  }
}

watch([() => chrome.comment.pick.value, live, markdown], ([hit, on, md]) => {
  if (shown.value) inlineArmed.value = Boolean(hit) && on && !md;
});

watch(inlineAsk, (ask) => {
  if (!ask) return;
  inlineAsk.value = false;
  openInline();
});

// Re-asserted after every pull, like the conversation key: the poll re-picks a slug whenever the held one is unknown.
watch(
  [() => conversation, () => slug, () => sc.sessions.value, shown],
  () => {
    if (!shown.value) return;
    sc.sessionKey.value = conversation;
    sc.slug.value = slug;
  },
  { immediate: true },
);

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
  if (event.key !== "Escape" || !shown.value) return;
  const [edit] = pendingEdits.value;
  if (!edit) return;
  event.preventDefault();
  void settle("revert", edit);
}

onMounted(() => {
  window.addEventListener("keydown", onWin);
});

watch(
  () => slug,
  (_, left) => sides.leave(conversation, "artifact", left),
);

onScopeDispose(() => {
  window.removeEventListener("keydown", onWin);
  inlineArmed.value = false;
  chrome.comment.disarm();
  sides.leave(conversation, "artifact", slug);
});
</script>

<template>
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

    <CommentLayer
      v-if="sc.artifact.value?.slug === slug"
      v-slot="{ canAsk, inset }"
      :file="path"
      :live="live"
      :marks="marks"
      :ready="measured && !showDiff"
      :slug="slug"
      :threads="threads"
      @reload="bump"
    >
      <ArtifactDiff
        v-if="showDiff && stage === 'version'"
        data-region="artifact-page"
        :path="path!"
        :state="versions.diffState.value!"
      />

      <ArtifactFrame
        v-else-if="stage === 'live' || stage === 'version'"
        ref="frame"
        data-region="artifact-page"
        :can-ask="canAsk"
        :can-edit="!markdown"
        :edition="edition"
        :file="path"
        :html="markdown ? undefined : html"
        :inset="inset"
        :slug="slug"
        :src="versionSrc"
        :version="versions.at.value"
        @edit="openInline"
        @marks="onMarks"
        @pending="takePending"
        @ready="onReady"
      />

      <div v-if="showDiff ? stage !== 'version' : !measured" class="gap" data-region="version-gap">
        <UiStateMessage v-if="stage === 'reading'" align="center" kind="loading">
          Reading turn {{ versions.at.value }}…
        </UiStateMessage>
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
    </CommentLayer>

    <div v-else class="blank">
      <UiStateMessage v-if="!sc.ready.value" align="center" kind="loading">Reading the page…</UiStateMessage>
      <UiStateMessage v-else align="center" kind="error">
        <b>{{ slug }}</b> could not be read from the artifacts directory.
      </UiStateMessage>
      <slot name="blank" />
    </div>
  </div>
</template>

<style scoped>
.page {
  @apply flex min-h-full w-full flex-col;
}

/* Only the artifact runs to the edges; its chrome insets itself. */
.page > :deep([data-region="version-tabs"]) {
  @apply mx-auto w-full max-w-(--page-w) px-(--gutter);
}

.gap,
.blank {
  @apply mx-auto w-full max-w-(--page-w) rounded-box border border-dashed border-border-strong bg-raised px-7 py-10 text-center text-[14px] text-muted;
}

.gap p,
.blank p {
  @apply m-0;
}

.gap p + p {
  @apply mt-2;
}

.title {
  @apply font-semibold text-fg;
}

.why {
  @apply text-pretty;
}

.back {
  @apply mt-3.5 inline-flex cursor-pointer items-center rounded-full border border-border bg-raised px-3 py-1.5 typo-caption-strong text-fg no-underline;
}

.back:hover {
  @apply border-fg;
}

.settle {
  @apply absolute z-28 inline-flex translate-x-2 -translate-y-1/2 items-center gap-0.5 px-1 py-0.5;
}
</style>
