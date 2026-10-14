<script lang="ts" setup>
import type { FrameAnchor, FrameHit, FrameMark, FramePending, ViewBox } from "~/types/frame";
import {
  blockAt,
  type Indexed,
  indexBlocks,
  indexedOf,
  isTyping,
  locate as locateIn,
  measure,
  pathOf,
  readAnchors,
  readPending,
} from "~~/lib/web/page/blocks";

const {
  canAsk = false,
  edition,
  html,
  inset = 0,
  slug,
  src,
  version,
} = defineProps<{
  canAsk?: boolean;
  edition?: number;
  html?: string;
  /** Pixels at the page's inline end that something laid over it holds, which the page's content leaves clear. */
  inset?: number;
  slug: string;
  src?: string;
  version?: number;
}>();

const emit = defineEmits<{
  anchors: [anchors: FrameAnchor[]];
  edit: [];
  marks: [marks: FrameMark[]];
  pending: [edits: FramePending[]];
  ready: [];
}>();

const SUPPRESS_ID = "sidecar-suppress";
const EDIT_ID = "sidecar-edit";

const chrome = useChrome();
const look = useTheme();

const frame = ref<HTMLIFrameElement>();
const height = ref(0);
const loaded = ref(false);

let watchers: (() => void)[] = [];
let indexed: Indexed[] = [];
let hot: Element | undefined;
let picked: Element | undefined;
let armKey: string | undefined;
let raf = 0;
let loadGen = 0;

// The frame is as tall as its page and its pane scrolls, so only what every clipping ancestor leaves is on screen.
function visibleBox(el: HTMLElement): ViewBox {
  let seen: ViewBox = {
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
    top: chrome.frame.insets.value.top,
  };
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (overflowX === "visible" && overflowY === "visible") continue;
    const box = node.getBoundingClientRect();
    seen = {
      bottom: Math.min(seen.bottom, box.bottom),
      left: Math.max(seen.left, box.left),
      right: Math.min(seen.right, box.right),
      top: Math.max(seen.top, box.top),
    };
  }
  return seen;
}

function hitOf(el: Element): FrameHit | undefined {
  const held = indexedOf(indexed, el);
  const box = el.getBoundingClientRect();
  const frameBox = frame.value?.getBoundingClientRect();
  const doc = el.ownerDocument;
  if (!held || !frameBox || !doc || !frame.value) return undefined;
  const scroll = doc.documentElement.scrollTop;
  return {
    clip: visibleBox(frame.value),
    height: box.height,
    key: held.key,
    label: held.label,
    left: box.left,
    path: pathOf(el),
    text: held.text,
    top: box.top + scroll,
    viewLeft: frameBox.left + box.left,
    viewTop: frameBox.top + box.top,
    width: box.width,
  };
}

function locate(hit?: { path: string; text: string }): Element | undefined {
  const doc = frame.value?.contentDocument;
  return doc ? locateIn(indexed, doc, hit) : undefined;
}

function teardown(): void {
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  for (const off of watchers) off();
  watchers = [];
  indexed = [];
  hot = undefined;
  picked = undefined;
}

function reset(): void {
  loadGen += 1;
  loaded.value = false;
  height.value = 0;
  teardown();
  emit("anchors", []);
  emit("pending", []);
}

function onLoad(): void {
  teardown();
  const doc = frame.value?.contentDocument;
  if (!doc) return;
  const gen = loadGen;

  indexed = indexBlocks(doc);

  // documentElement.scrollHeight floors at the viewport, so a tall boot frame would never shrink back.
  const remeasure = (): void => {
    height.value = doc.body?.scrollHeight || doc.documentElement.scrollHeight;
    emit("anchors", readAnchors(doc, doc.documentElement.scrollTop));
    emit("marks", measure(indexed, doc.documentElement.scrollTop));
    emit("pending", readPending(doc, doc.documentElement.scrollTop));
  };

  syncTheme(doc);
  suppressPageChrome(doc);
  injectEditStyle(doc);
  applyInset(doc);
  remeasure();
  loaded.value = true;

  const held = chrome.comment.pick.value;
  const restored = locate(held);
  picked = restored;
  if (held && !restored) chrome.comment.select(undefined);
  publish();
  void nextTick(() => {
    if (gen !== loadGen) return;
    emit("ready");
  });

  // rAF: a sync size write inside ResizeObserver re-notifies the same observer.
  const resize = new ResizeObserver(() => scheduleRepublish());
  resize.observe(doc.body ?? doc.documentElement);
  watchers.push(() => resize.disconnect());

  const onMove = (event: MouseEvent): void => {
    if (!chrome.comment.armed.value || chrome.comment.spot.value) return;
    const next = blockAt(event.target);
    if (next === hot) {
      publish();
      return;
    }
    hot = next;
    publish();
  };
  const onLeave = (): void => {
    hot = undefined;
    if (!picked) chrome.comment.light(undefined);
  };

  const onClick = (event: MouseEvent): void => {
    if (chrome.comment.spot.value) return;
    // A receipt opens away rather than in here, which would navigate the artifact out of its own frame.
    const link = (event.target as Element | undefined)?.closest?.("a[href^='http']");
    if (link) {
      event.preventDefault();
      window.open(link.getAttribute("href") ?? "", "_blank", "noopener");
      return;
    }
    // Unarmed the artifact is being read, so a block click stays the page's own: no ring, no composer.
    if (!chrome.comment.armed.value) return;
    const node = blockAt(event.target);
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    picked = node;
    hot = node;
    const hit = hitOf(node);
    if (hit) chrome.comment.compose(hit, canAsk);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const meta = event.metaKey || event.ctrlKey;
    // A held key auto-repeats into the popover box its own click just focused.
    if (armKey && event.key.toLowerCase() === armKey) {
      event.preventDefault();
      return;
    }
    if (meta && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (picked || hot) emit("edit");
      else if (chrome.comment.armed.value) chrome.comment.disarm();
      else chrome.comment.arm();
      return;
    }
    if (event.key === "Escape") {
      if (chrome.dismiss()) event.preventDefault();
      return;
    }
    if (meta || event.altKey || isTyping(event.target)) return;
    if (event.key.toLowerCase() === "c" && !event.repeat) {
      armKey = "c";
      chrome.comment.arm(true);
    }
  };
  // A hold begun in the app window ends here once a click has carried focus into the frame.
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() !== "c" || (!armKey && !chrome.comment.held.value)) return;
    armKey = undefined;
    chrome.comment.release();
  };

  doc.addEventListener("mousemove", onMove);
  doc.addEventListener("mouseleave", onLeave);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onKeyDown);
  doc.addEventListener("keyup", onKeyUp);
  window.addEventListener("scroll", scheduleRepublish, true);
  window.addEventListener("resize", scheduleRepublish);
  watchers.push(() => {
    doc.removeEventListener("mousemove", onMove);
    doc.removeEventListener("mouseleave", onLeave);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onKeyDown);
    doc.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("scroll", scheduleRepublish, true);
    window.removeEventListener("resize", scheduleRepublish);
  });
}

function publish(): void {
  if (picked) {
    const hit = hitOf(picked);
    if (hit) chrome.comment.select(hit);
  }
  if (hot && hot !== picked) {
    const hit = hitOf(hot);
    if (hit) chrome.comment.light(ringOf(hit));
  } else if (!picked && !hot) chrome.comment.light(undefined);
}

function scheduleRepublish(): void {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const doc = frame.value?.contentDocument;
    if (doc) {
      const next = doc.body?.scrollHeight || doc.documentElement.scrollHeight;
      if (next !== height.value) height.value = next;
      emit("anchors", readAnchors(doc, doc.documentElement.scrollTop));
      emit("marks", measure(indexed, doc.documentElement.scrollTop));
      emit("pending", readPending(doc, doc.documentElement.scrollTop));
    }
    publish();
  });
}

function clearPick(): void {
  picked = undefined;
  hot = undefined;
  chrome.comment.select(undefined);
  chrome.comment.light(undefined);
}

// The artifact carries its own theme stamp, so the frame follows the sidecar's toggle rather than the OS.
function syncTheme(doc: Document): void {
  doc.documentElement.setAttribute("data-theme", look.theme.value);
}

// The page ships its own theme toggle and the frame is sized to its content: both would be a second one over the app.
function suppressPageChrome(doc: Document): void {
  if (doc.getElementById(SUPPRESS_ID)) return;
  const style = doc.createElement("style");
  style.id = SUPPRESS_ID;
  style.textContent = ".theme-toggle{display:none !important}html{overflow:hidden !important}";
  doc.head?.append(style);
}

// Padding on the root narrows everything in flow while the root's and body's grounds still paint the full width.
function applyInset(doc: Document): void {
  if (inset) doc.documentElement.style.setProperty("padding-inline-end", `${inset}px`, "important");
  else doc.documentElement.style.removeProperty("padding-inline-end");
}

function injectEditStyle(doc: Document): void {
  if (doc.getElementById(EDIT_ID)) return;
  const style = doc.createElement("style");
  style.id = EDIT_ID;
  style.textContent = `del[data-sc-edit]{color:var(--error);text-decoration:line-through}ins[data-sc-edit]{background:color-mix(in oklch,var(--success) 16%,transparent);color:var(--success);text-decoration:none}`;
  doc.head?.append(style);
}

watch(look.theme, () => {
  const doc = frame.value?.contentDocument;
  if (doc) syncTheme(doc);
});

watch(
  () => inset,
  () => {
    const doc = frame.value?.contentDocument;
    if (doc) applyInset(doc);
  },
);

watch(() => [edition, html, slug, version], reset);

onScopeDispose(teardown);

watch(chrome.comment.pick, (hit) => {
  if (hit) return;
  picked = undefined;
});

watch(chrome.comment.armed, (on) => {
  if (!on) clearPick();
});

defineExpose({ clearPick });
</script>

<template>
  <div class="sheet" :data-loaded="loaded ? '' : undefined">
    <iframe
      ref="frame"
      :key="`${slug}:${version ?? 'head'}:${edition ?? 0}`"
      :src="html ? undefined : src || `/artifact/${slug}`"
      :srcdoc="html"
      :style="{ height: height ? `${height}px` : undefined }"
      :title="`Artifact ${slug}`"
      loading="eager"
      @load="onLoad"
    />
    <UiStateMessage v-if="!loaded" class="pending" kind="loading">Rendering the page…</UiStateMessage>
  </div>
</template>

<style scoped>
/* No card: a border and a shadow here read as a document sitting on a surface, and what this
   is meant to read as is the file itself. */
.sheet {
  min-height: 240px;
  overflow: hidden;
  position: relative;
}

/* The frame boots taller than the page; clip it until the real height is measured. */
.sheet:not([data-loaded]) {
  max-height: 60vh;
}

/* Boots tall so the artifact's own reveal observer sees the whole page in view, then shrinks to fit. */
iframe {
  border: 0;
  display: block;
  height: 2400px;
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
  width: 100%;
}

.sheet[data-loaded] iframe {
  opacity: 1;
}

.pending {
  left: 24px;
  position: absolute;
  top: 24px;
}

@media (prefers-reduced-motion: reduce) {
  iframe {
    transition: none;
  }
}
</style>
