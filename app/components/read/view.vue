<script lang="ts" setup>
import { Check, RotateCcw } from "@lucide/vue";
import type { FrameMark, FramePending, FrameSelection } from "~/types/frame";
import type { DiffGap } from "~~/shared/types/versions";

type Stage = "live" | "reading" | "unreadable" | "version";

// Same vocabulary History uses for the same gaps, worded for a version rather than a diff.
const GAP: Record<DiffGap, string> = {
  "missing-content": "no version of this file was stored for this turn",
  "skipped": "this file is not versioned — it was over the size budget",
  "store-failed": "the version store could not be read",
  "unknown-baseline": "what stood before this file was first touched could not be reconstructed",
  "unresolved-target": "there is no version of this file at the point being asked for",
};

const sc = useSidecar();
const chrome = useChrome();
const { session } = useScreen();

const frame = ref<{ clearSelection: () => void }>();
const marks = ref<FrameMark[]>([]);
const measured = ref(false);
const selection = ref<FrameSelection>();
const panel = ref<FrameSelection>();
const pendingEdits = ref<FramePending[]>([]);
const edition = ref(0);
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

function clearSelection(): void {
  selection.value = undefined;
  frame.value?.clearSelection();
}

function openInline(): void {
  if (!selection.value) return;
  panel.value = selection.value;
}

function closeInline(): void {
  panel.value = undefined;
  clearSelection();
}

function onApplied(): void {
  edition.value += 1;
  pendingEdits.value = [];
  closeInline();
}

async function settle(action: "accept" | "revert", edit: FramePending): Promise<void> {
  const slug = sc.slug.value;
  if (!slug) return;
  try {
    await $fetch(`/api/artifacts/${slug}/edit`, {
      body: { action, selection: edit.selection },
      method: "POST",
    });
    edition.value += 1;
  } catch {
    chrome.toast("That change could not be settled", "destructive");
  }
}

watch([selection, live], ([next, on]) => {
  inlineArmed.value = Boolean(next) && on;
});

watch(inlineAsk, (ask) => {
  if (!ask) return;
  inlineAsk.value = false;
  openInline();
});

// Until the frame has measured once every thread looks adrift, so the gutter waits rather than lying.
watch([() => sc.slug.value, () => versions.at.value], () => {
  marks.value = [];
  measured.value = false;
  selection.value = undefined;
  panel.value = undefined;
  pendingEdits.value = [];
});

onScopeDispose(() => {
  inlineArmed.value = false;
});
</script>

<template>
  <div class="read" data-region="read-view">
    <ReadVersions
      v-model="versions.at.value"
      :baseline="versions.baseline.value"
      :head="versions.head.value"
      :list="versions.list.value"
      :reading="versions.reading.value"
      :skipped="versions.skipped.value"
      :slug="sc.slug.value ?? ''"
      :unreachable="versions.unreachable.value"
    />

    <div v-if="sc.slug.value && sc.artifact.value" class="stack">
      <ArtifactGutter
        v-if="measured"
        side="right"
        :live="live"
        :marks="marks"
        :threads="threads"
        @reload="edition += 1"
      />

      <ArtifactFrame
        v-if="stage === 'live' || stage === 'version'"
        ref="frame"
        data-region="artifact-page"
        :edition="edition"
        :html="html"
        :slug="sc.slug.value"
        :version="versions.at.value"
        @edit="openInline"
        @marks="onMarks"
        @pending="pendingEdits = $event"
        @select="selection = $event"
      />

      <div v-else class="gap" data-region="read-gap">
        <p v-if="stage === 'reading'" class="mono-meta">reading t{{ versions.at.value }}…</p>
        <template v-else>
          <p class="title">This version could not be read back.</p>
          <p class="why">{{ gap }}.</p>
          <p class="why">
            Nothing is drawn here rather than a blank page, which would read as though t{{ versions.at.value }} of
            <b>{{ sc.slug.value }}</b> changed nothing.
          </p>
          <button v-press class="back focusable" type="button" @click="versions.at.value = undefined">
            Back to latest
          </button>
        </template>
      </div>

      <ReadCompose
        :key="`${sc.slug.value}:${versions.at.value ?? 'head'}`"
        :editable="live"
        :open="!!panel"
        :selection="selection"
        :slug="sc.slug.value"
        @done="clearSelection"
        @edit="openInline"
      />

      <ReadInline
        v-if="panel"
        :live="live"
        :selection="panel"
        :slug="sc.slug.value"
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
      <p v-if="!session">No conversation is selected, so there is no artifact to show.</p>
      <p v-else-if="!session.artifacts.length">
        <b>{{ nameOf(session) }}</b> has stamped no artifact yet. One appears here the moment it does.
      </p>
      <p v-else-if="!sc.slug.value">Pick an artifact above.</p>
      <p v-else>
        <b>{{ sc.slug.value }}</b> is listed against this conversation but could not be read from the artifacts
        directory.
      </p>
    </div>
  </div>
</template>

<style scoped>
.read {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  max-width: var(--page-w);
  min-height: 100%;
  padding-bottom: 24px;
  width: 100%;
}

/* The gutter hangs off the right edge, so the column leaves it room rather than clipping it. */
.stack {
  margin-right: var(--gutter-w);
  margin-top: 16px;
  position: relative;
}

.gap,
.blank {
  background: var(--raised);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-box);
  color: var(--muted);
  font-size: 14px;
  padding: 40px 28px;
  text-align: center;
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
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  margin-top: 14px;
  padding: 6px 12px;
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
</style>
