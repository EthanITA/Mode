<script lang="ts" setup>
const DWELL_MS = 2800;
const VISIBLE = 3;

const chrome = useChrome();

const timers = new Map<number, ReturnType<typeof setTimeout>>();

const shown = computed(() => chrome.toasts.value.slice(-VISIBLE));
const queued = computed(() => chrome.toasts.value.length - shown.value.length);

function drop(id: number): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  chrome.toasts.value = chrome.toasts.value.filter((row) => row.id !== id);
}

function arm(id: number): void {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => drop(id), DWELL_MS));
}

// Held, not paused: a reader who leaves gets the full dwell again rather than its remainder.
function hold(id: number): void {
  clearTimeout(timers.get(id));
}

// Every toast is armed on arrival, including one queued behind the visible three,
// so nothing can pile up unseen while the lane is full.
watch(
  chrome.toasts,
  (rows) => {
    for (const row of rows) if (!timers.has(row.id)) arm(row.id);
  },
  { immediate: true },
);

onScopeDispose(() => {
  for (const timer of timers.values()) clearTimeout(timer);
});
</script>

<template>
  <div
    v-if="chrome.toasts.value.length"
    class="toaster"
    data-region="toaster"
    :data-armed="chrome.comment.armed.value"
    role="status"
    aria-live="polite"
  >
    <button
      v-for="row in shown"
      :key="row.id"
      v-press
      class="one"
      type="button"
      aria-label="Dismiss"
      @click="drop(row.id)"
      @focusin="hold(row.id)"
      @focusout="arm(row.id)"
      @mouseenter="hold(row.id)"
      @mouseleave="arm(row.id)"
    >
      <UiToast :variant="row.tone">{{ row.text }}</UiToast>
    </button>

    <span v-if="queued > 0" class="queued mono-meta">+{{ queued }}</span>
  </div>
</template>

<style scoped>
/* The transient lane, per design-system/components/island.md: top-center, empty at rest. */
.toaster {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  left: 50%;
  pointer-events: none;
  position: fixed;
  top: 68px;
  transform: translateX(-50%);
  transition: top var(--duration-base) var(--ease-out);
  z-index: 50;
}

/* Comment mode puts its own banner in this lane, so the toasts move below it. */
.toaster[data-armed="true"] {
  top: 112px;
}

.one {
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0;
  pointer-events: auto;
}

.queued {
  background: var(--sunken);
  border-radius: 999px;
  color: var(--muted);
  padding: 3px 9px;
}

@media (prefers-reduced-motion: reduce) {
  .toaster {
    transition: none;
  }
}
</style>
