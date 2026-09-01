<script lang="ts" setup>
import type { FrameAnchor, FrameBlock } from "~/types/frame";

const sc = useSidecar();
const { session } = useScreen();

const anchors = ref<FrameAnchor[]>([]);
const block = ref<FrameBlock>();
</script>

<template>
  <div class="column">
    <ArtifactSwitcher />

    <div v-if="sc.slug.value && sc.artifact.value" class="stack">
      <ArtifactGutter v-if="!sc.panelOpen.value" :anchors="anchors" :threads="sc.artifact.value.threads" />

      <ArtifactFrame
        data-region="artifact-page"
        :slug="sc.slug.value"
        @anchors="anchors = $event"
        @block="block = $event"
      />

      <button
        v-if="block"
        class="add-note focusable mono-meta"
        type="button"
        disabled
        title="Read only: notes are attached from the artifact's own review layer"
        :style="{ top: `${block.top + Math.min(block.height, 40) / 2 - 12}px` }"
      >
        + note
      </button>
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

    <div class="foot">
      <PipelineIsland :with-slots="!sc.panelOpen.value" />
    </div>
  </div>
</template>

<style scoped>
.column {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  max-width: var(--page-w);
  min-height: 100%;
  padding-bottom: 24px;
  width: 100%;
}

.stack {
  position: relative;
}

/* Rides the block under the cursor inside the frame, at the page's right edge. */
.add-note {
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--muted);
  cursor: not-allowed;
  opacity: 0.85;
  padding: 4px 10px;
  position: absolute;
  right: -14px;
  transition: top var(--duration-fast) var(--ease-out);
  z-index: 3;
}

.blank {
  background: var(--raised);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-box);
  color: var(--muted);
  font-size: 14px;
  padding: 40px 28px;
  text-align: center;
}

.blank p {
  margin: 0;
}

/* margin-top:auto parks it at the foot of a short page; sticky keeps it there on a long one. */
.foot {
  bottom: 24px;
  display: flex;
  justify-content: center;
  margin-top: auto;
  padding-top: 24px;
  pointer-events: none;
  position: sticky;
  z-index: 5;
}

.foot > * {
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .add-note {
    transition: none;
  }
}
</style>
