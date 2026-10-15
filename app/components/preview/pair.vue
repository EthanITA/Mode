<script lang="ts" setup>
import type { PreviewKind, PreviewScroll } from "~/utils/preview";

export type PreviewSide = { src: string } | { empty: string };

type Side = "after" | "before";
type Followable = { follow: (at: PreviewScroll) => void };

const { kind, before, after, isSynced } = defineProps<{
  kind: PreviewKind;
  before: PreviewSide;
  after: PreviewSide;
  isSynced: boolean;
}>();
const zoom = defineModel<number>("zoom", { required: true });

const stageBefore = useTemplateRef<Followable>("stageBefore");
const stageAfter = useTemplateRef<Followable>("stageAfter");

// Only the side being handled leads, so the follower's own scroll event never echoes back.
let leader = "after" as Side;

function onScrolled(side: Side, at: PreviewScroll): void {
  if (!isSynced || side !== leader) return;
  (side === "before" ? stageAfter : stageBefore).value?.follow(at);
}
</script>

<template>
  <div class="pair" data-region="preview-pair">
    <PreviewStage
      v-if="'src' in before"
      ref="stageBefore"
      v-model:zoom="zoom"
      :kind="kind"
      :src="before.src"
      @engage="leader = 'before'"
      @scrolled="onScrolled('before', $event)"
    />
    <UiStateMessage v-else align="center" class="gap">{{ before.empty }}</UiStateMessage>
    <PreviewStage
      v-if="'src' in after"
      ref="stageAfter"
      v-model:zoom="zoom"
      :kind="kind"
      :src="after.src"
      @engage="leader = 'after'"
      @scrolled="onScrolled('after', $event)"
    />
    <UiStateMessage v-else align="center" class="gap">{{ after.empty }}</UiStateMessage>
  </div>
</template>

<style scoped>
/* The 1px gap shows the border colour behind, as the seam between the two sides. */
.pair {
  @apply grid h-full min-h-0 grid-cols-2 gap-px bg-ed-border;
}

.gap {
  @apply bg-ed-bg p-4;
  --ink: var(--ed-ink);
  --muted: var(--ed-muted);
  --subtle: var(--ed-muted);
}
</style>
