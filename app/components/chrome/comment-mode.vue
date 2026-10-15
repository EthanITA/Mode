<script lang="ts" setup>
import type { CommentTarget } from "~/composables/useChrome";

const route = useRoute();
const chrome = useChrome();

let lit: HTMLElement | undefined;
let seen: CommentTarget | undefined;

function flatten(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function describe(el: HTMLElement): CommentTarget | undefined {
  const kind = el.dataset.cmt;
  if (!kind) return undefined;
  const label = el.dataset.cmtLabel || flatten(el.innerText, 60);
  return {
    excerpt: el.dataset.cmtExcerpt,
    kind,
    label,
    tell: el.dataset.cmtTell || `On ${kind} “${label}”`,
  };
}

function target(event: MouseEvent): HTMLElement | undefined {
  if (!(event.target instanceof Element)) return undefined;
  return event.target.closest<HTMLElement>("[data-cmt]") ?? undefined;
}

function fromFrame(event: Event): boolean {
  const node = event.target;
  return node instanceof HTMLIFrameElement || (node instanceof Element && !!node.closest("iframe"));
}

function onMove(event: MouseEvent): void {
  if (!chrome.comment.armed.value || chrome.comment.spot.value) return;
  if (fromFrame(event)) return;
  const el = target(event);
  if (el !== lit) {
    lit = el;
    seen = el && describe(el);
  }
  if (!lit || !seen) {
    if (!chrome.comment.pick.value) chrome.comment.light(undefined);
    return;
  }
  const box = lit.getBoundingClientRect();
  chrome.comment.light({
    height: box.height,
    label: `${seen.kind} · ${seen.label}`,
    left: box.left,
    top: box.top,
    width: box.width,
    x: Math.min(event.clientX + 14, window.innerWidth - 360),
    y: event.clientY + 16,
  });
}

// pointer events fire before mouse events, so this is the only place a card's own drag can be stopped.
function onPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Element && event.target.closest("[data-region='select-ask']")))
    chrome.comment.offer(undefined);
  if (fromFrame(event)) return;
  if (!chrome.comment.armed.value || chrome.comment.spot.value || !target(event)) return;
  event.stopPropagation();
}

function onDown(event: MouseEvent): void {
  if (!chrome.comment.armed.value || chrome.comment.spot.value) return;
  if (fromFrame(event)) return;
  const el = target(event);
  const found = el && describe(el);
  if (!found) return;
  event.preventDefault();
  event.stopPropagation();
  chrome.comment.light(undefined);
  lit = undefined;
  chrome.comment.open({
    ...found,
    x: Math.min(Math.max(12, event.clientX - 210), window.innerWidth - 432),
    y: Math.min(event.clientY + 14, window.innerHeight - 300),
  });
}

// The element's own click would still fire after the popover opened over it.
function onClick(event: MouseEvent): void {
  if (fromFrame(event)) return;
  if (!chrome.comment.armed.value || !target(event)) return;
  event.preventDefault();
  event.stopPropagation();
}

// A target belongs to the conversation it was picked in, and the tray is keyed on that.
watch(() => route.fullPath, chrome.comment.disarm);

watch(chrome.comment.armed, (on) => {
  if (on) return;
  lit = undefined;
  seen = undefined;
});

onMounted(() => {
  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("click", onClick, true);
  onScopeDispose(() => {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("click", onClick, true);
  });
});
</script>

<template>
  <!-- Reading is not reviewing: the ring and the banner both belong to the explicit arm. -->
  <div v-if="chrome.comment.armed.value || chrome.comment.hover.value" class="armed" data-region="comment-mode">
    <p
      v-if="chrome.comment.armed.value"
      class="banner"
      data-region="comment-banner"
      data-tip="Cancel · {esc}"
      data-tip-align="center"
    >
      Pick anything to comment on
    </p>

    <template v-if="chrome.comment.hover.value">
      <span
        class="ring"
        :data-selected="Boolean(chrome.comment.pick.value)"
        :style="{
          height: `${chrome.comment.hover.value.height}px`,
          left: `${chrome.comment.hover.value.left}px`,
          top: `${chrome.comment.hover.value.top}px`,
          width: `${chrome.comment.hover.value.width}px`,
        }"
      />
      <span
        class="chip"
        :style="{ left: `${chrome.comment.hover.value.x}px`, top: `${chrome.comment.hover.value.y}px` }"
        >{{ chrome.comment.hover.value.label }}</span
      >
    </template>
  </div>

  <ChromeCommentChip
    v-if="chrome.comment.offered.value && !chrome.comment.spot.value"
    :offer="chrome.comment.offered.value"
  />
  <ChromeCommentPopover v-if="chrome.comment.spot.value" :spot="chrome.comment.spot.value" />
</template>

<style scoped>
.armed {
  @apply pointer-events-none fixed inset-0 z-34;
}

/* The overlay lets the pointer through to pick, so the banner opts back in for its tip. */
.banner {
  @apply pointer-events-auto absolute top-16 left-1/2 m-0 inline-flex h-8.5 -translate-x-1/2 items-center gap-2.5 rounded-full bg-primary px-3.5 py-0 typo-caption-strong text-primary-content shadow-md;
}

/* Drawn beside the element rather than on it: chrome never writes into a view's DOM. */
.ring {
  @apply absolute -m-0.5 block rounded-md border-2 border-primary;
}

.chip {
  @apply absolute inline-flex h-6.5 max-w-85 items-center truncate rounded-lg bg-fg px-2.5 py-0 font-mono typo-meta-strong text-canvas;
}

.ring[data-selected="true"] {
  @apply outline-2 outline-offset-2 outline-primary;
}
</style>
