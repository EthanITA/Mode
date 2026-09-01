<script lang="ts" setup>
import type { ReviewThread } from "~~/shared/types/artifact";
import type { FrameAnchor } from "~/types/frame";

const { anchors, threads } = defineProps<{
  anchors: FrameAnchor[];
  threads: ReviewThread[];
}>();

interface Marker {
  anchored: boolean;
  key: string;
  label: string;
  resolved: boolean;
  threads: ReviewThread[];
  top: number;
}

const UNANCHORED_TOP = 24;
const UNANCHORED_STEP = 40;

const sc = useSidecar();
const instant = ref(false);

const markers = computed<Marker[]>(() => {
  const byLabel = new Map<string, ReviewThread[]>();
  for (const thread of threads) {
    const label = thread.anchor?.label || "";
    const bucket = byLabel.get(label);
    if (bucket) bucket.push(thread);
    else byLabel.set(label, [thread]);
  }
  let drifting = 0;
  return [...byLabel].map(([label, list]) => {
    const at = anchors.find((anchor) => anchor.label.toLowerCase().startsWith(label.toLowerCase().slice(0, 24)));
    const anchored = Boolean(label && at);
    return {
      anchored,
      key: label || `loose-${list[0]?.id ?? drifting}`,
      label,
      resolved: list.every((thread) => thread.status === "resolved"),
      threads: list,
      // A note whose section is gone still has to appear, so it stacks from the top.
      top: at?.top ?? UNANCHORED_TOP + UNANCHORED_STEP * drifting++,
    };
  });
});

const open = computed(() => markers.value.find((marker) => marker.key === sc.openThread.value));

function toggle(marker: Marker): void {
  instant.value = false;
  sc.openThread.value = sc.openThread.value === marker.key ? undefined : marker.key;
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== "Escape" || !sc.openThread.value) return;
  instant.value = true; // a keyboard dismissal never animates
  sc.openThread.value = undefined;
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  onScopeDispose(() => window.removeEventListener("keydown", onKey));
});
</script>

<template>
  <div class="gutter" data-region="gutter-markers" :data-instant="instant ? '' : undefined">
    <button
      v-for="marker in markers"
      :key="marker.key"
      class="marker focusable plain-button mono-meta"
      type="button"
      :style="{ top: `${marker.top}px` }"
      :data-open="marker.key === sc.openThread.value ? '' : undefined"
      :data-resolved="marker.resolved ? '' : undefined"
      :data-loose="marker.anchored ? undefined : ''"
      :title="marker.label || 'Somewhere on the page'"
      @click="toggle(marker)"
    >
      <svg v-if="marker.resolved" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3 4.8 8.6 9.5 3.9" /></svg>
      <template v-else>{{ marker.threads.length }}</template>
    </button>

    <p v-if="!markers.length" class="none mono-meta">no notes</p>

    <div v-if="open" class="popover" :style="{ top: `${open.top}px` }">
      <p class="where mono-meta">{{ open.label || "somewhere on the page" }}</p>
      <NotesCard v-for="thread in open.threads" :key="thread.id" :thread="thread" compact />
      <div class="foot">
        <input class="reply" type="text" placeholder="Reply…" disabled aria-label="Reply (read only)" />
        <button class="plain-button mono-meta act" type="button" disabled title="Read only: the sidecar never writes a note">
          Resolve
        </button>
        <span class="hint mono-meta">esc</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gutter {
  bottom: 0;
  left: calc(-1 * var(--gutter-w));
  position: absolute;
  top: 0;
  width: var(--gutter-w);
}

/* An empty gutter with no words reads as broken, so it says so. */
.none {
  color: var(--subtle);
  margin: 0;
  position: absolute;
  right: 10px;
  top: 24px;
  transform: rotate(180deg);
  writing-mode: vertical-rl;
}

.marker {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--muted);
  display: flex;
  height: 22px;
  justify-content: center;
  position: absolute;
  right: 10px;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
  width: 22px;
}

.marker:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: scale(1.08);
}

.marker[data-open] {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-content);
}

.marker[data-resolved] {
  border-color: color-mix(in oklch, var(--success) 45%, transparent);
  color: var(--success);
}

.marker[data-loose] {
  border-style: dashed;
}

.marker svg {
  fill: none;
  height: 11px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 11px;
}

.popover {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-box);
  box-shadow: var(--shadow-lg);
  left: calc(var(--gutter-w) + 8px);
  padding: 12px;
  position: absolute;
  width: 320px;
  z-index: 4;
}

.gutter:not([data-instant]) .popover {
  animation: pop var(--duration-fast) var(--ease-out) both;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
}

.where {
  color: var(--subtle);
  margin: 0 0 8px;
}

.foot {
  align-items: center;
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.reply {
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-field);
  color: var(--muted);
  flex: 1;
  font: inherit;
  font-size: 12px;
  min-width: 0;
  padding: 6px 10px;
}

.reply:disabled {
  cursor: not-allowed;
}

.act {
  color: var(--subtle);
  opacity: 0.6;
}

.hint {
  background: var(--sunken);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--subtle);
  padding: 2px 5px;
}

@media (prefers-reduced-motion: reduce) {
  .marker {
    transition: none;
  }

  .popover {
    animation: none;
  }
}
</style>
