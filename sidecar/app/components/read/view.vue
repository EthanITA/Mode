<script lang="ts" setup>
import type { FrameMark, FrameSelection } from "~/types/frame";

type Stage = "live" | "reading" | "unreadable" | "version";

const sc = useSidecar();
const { session } = useScreen();

const frame = ref<{ clearSelection: () => void }>();
const marks = ref<FrameMark[]>([]);
const measured = ref(false);
const selection = ref<FrameSelection>();

const path = computed(() => sc.artifact.value?.path);
const versions = useReadVersions({ path, sessionKey: sc.sessionKey });

const threads = computed(() => sc.artifact.value?.threads ?? []);

const stage = computed<Stage>(() => {
  if (!versions.at.value) return "live";
  const got = versions.content.value;
  if (!got) return "reading";
  return got.missing ? "unreadable" : "version";
});

const html = computed(() => (stage.value === "version" ? versions.content.value?.content : undefined));

function onMarks(next: FrameMark[]): void {
  marks.value = next;
  measured.value = true;
}

function clearSelection(): void {
  selection.value = undefined;
  frame.value?.clearSelection();
}

// Until the frame has measured once every thread looks adrift, so the gutter waits rather than lying.
watch([() => sc.slug.value, () => versions.at.value], () => {
  marks.value = [];
  measured.value = false;
  selection.value = undefined;
  sc.openThread.value = undefined;
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
      :unreachable="versions.unreachable.value"
    />

    <div v-if="sc.slug.value && sc.artifact.value" class="stack">
      <ArtifactGutter v-if="measured" side="right" :marks="marks" :threads="threads" />

      <ArtifactFrame
        v-if="stage === 'live' || stage === 'version'"
        ref="frame"
        data-region="artifact-page"
        :html="html"
        :slug="sc.slug.value"
        :version="versions.at.value"
        @marks="onMarks"
        @select="selection = $event"
      />

      <div v-else class="gap">
        <p v-if="stage === 'reading'" class="mono-meta">reading t{{ versions.at.value }}…</p>
        <template v-else>
          <p class="title">This version could not be read back.</p>
          <p class="why">
            The store lists t{{ versions.at.value }} for <b>{{ sc.slug.value }}</b>, but its content did not come
            back. Nothing is drawn here rather than a blank page, which would read as though the version changed
            nothing.
          </p>
          <button class="back focusable" type="button" @click="versions.at.value = undefined">Back to latest</button>
        </template>
      </div>

      <ReadCompose
        :key="`${sc.slug.value}:${versions.at.value ?? 'head'}`"
        :selection="selection"
        :slug="sc.slug.value"
        @done="clearSelection"
      />
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
</style>
