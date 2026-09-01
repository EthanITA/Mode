<script lang="ts" setup>
import type { FrameAnchor, FrameBlock } from "~/types/frame";

const { slug } = defineProps<{ slug: string }>();

const emit = defineEmits<{
  anchors: [anchors: FrameAnchor[]];
  block: [block?: FrameBlock];
}>();

// Mirrors labelOf() in the review layer: the anchor label is the host section's own heading.
const HOSTS = "section, article, figure, .panel, .stage";
const HEADINGS = "h1, h2, h3, h4";
const BLOCKS = "p, li, h1, h2, h3, h4, blockquote, pre, table, figure";
const LABEL_MAX = 44;
const SUPPRESS_ID = "sidecar-suppress";

const frame = ref<HTMLIFrameElement>();
const height = ref(0);
const loaded = ref(false);

let watchers: (() => void)[] = [];

function norm(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

// The frame is a second realm, so `instanceof Element` from here is always false; duck-typing is the only test.
function blockAt(target: unknown): Element | undefined {
  const node = target as { closest?: (selectors: string) => Element | null } | undefined; // external contract: DOM closest()
  return node?.closest?.(BLOCKS) ?? undefined;
}

function readAnchors(doc: Document): FrameAnchor[] {
  const out: FrameAnchor[] = [];
  const seen = new Set<string>();
  for (const host of doc.querySelectorAll<HTMLElement>(HOSTS)) {
    const label = norm(host.querySelector(HEADINGS)?.textContent).slice(0, LABEL_MAX);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, top: host.getBoundingClientRect().top + doc.documentElement.scrollTop });
  }
  return out;
}

function teardown(): void {
  for (const off of watchers) off();
  watchers = [];
}

function onLoad(): void {
  teardown();
  const doc = frame.value?.contentDocument;
  if (!doc) return;

  // documentElement.scrollHeight floors at the viewport, so a tall boot frame would never shrink back.
  const measure = (): void => {
    height.value = doc.body?.scrollHeight || doc.documentElement.scrollHeight;
    emit("anchors", readAnchors(doc));
  };

  syncTheme(doc);
  hidePageToggle(doc);
  measure();
  loaded.value = true;

  const resize = new ResizeObserver(measure);
  resize.observe(doc.body ?? doc.documentElement);
  watchers.push(() => resize.disconnect());

  const onMove = (event: MouseEvent): void => {
    const block = blockAt(event.target);
    if (!block) {
      emit("block", undefined);
      return;
    }
    const box = block.getBoundingClientRect();
    emit("block", { height: box.height, top: box.top + doc.documentElement.scrollTop });
  };
  const onLeave = (): void => emit("block", undefined);

  doc.addEventListener("mousemove", onMove);
  doc.addEventListener("mouseleave", onLeave);
  watchers.push(() => {
    doc.removeEventListener("mousemove", onMove);
    doc.removeEventListener("mouseleave", onLeave);
  });
}

// The artifact carries its own theme stamp, so the frame follows the app's toggle rather than the OS.
function syncTheme(doc: Document): void {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) doc.documentElement.setAttribute("data-theme", theme);
}

// Every Cela artifact ships a fixed theme toggle; a second one floating over the app is a bug, like the review layer.
function hidePageToggle(doc: Document): void {
  if (doc.getElementById(SUPPRESS_ID)) return;
  const style = doc.createElement("style");
  style.id = SUPPRESS_ID;
  style.textContent = ".theme-toggle { display: none !important; }";
  doc.head?.append(style);
}

onMounted(() => {
  const observer = new MutationObserver(() => {
    const doc = frame.value?.contentDocument;
    if (doc) syncTheme(doc);
  });
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  onScopeDispose(() => observer.disconnect());
});

watch(
  () => slug,
  () => {
    loaded.value = false;
    height.value = 0;
    teardown();
    emit("anchors", []);
    emit("block", undefined);
  },
);

onScopeDispose(teardown);
</script>

<template>
  <div class="sheet" :data-loaded="loaded ? '' : undefined">
    <iframe
      ref="frame"
      :key="slug"
      :src="`/artifact/${slug}`"
      :style="{ height: height ? `${height}px` : undefined }"
      :title="`Artifact ${slug}`"
      loading="eager"
      @load="onLoad"
    />
    <p v-if="!loaded" class="pending mono-meta">Rendering {{ slug }}…</p>
  </div>
</template>

<style scoped>
.sheet {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-box);
  box-shadow: var(--shadow-lg);
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
  color: var(--subtle);
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
