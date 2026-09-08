<script lang="ts" setup>
import type { FrameAnchor, FrameBlock, FrameMark, FramePending, FrameSelection } from "~/types/frame";

const { edition, html, slug, version } = defineProps<{
  edition?: number;
  html?: string;
  slug: string;
  version?: number;
}>();

const emit = defineEmits<{
  anchors: [anchors: FrameAnchor[]];
  block: [block?: FrameBlock];
  edit: [];
  marks: [marks: FrameMark[]];
  pending: [edits: FramePending[]];
  select: [selection?: FrameSelection];
}>();

// Mirrors labelOf() in the review layer: the anchor label is the host section's own heading.
const HOSTS = "section, article, figure, .panel, .stage";
const HEADINGS = "h1, h2, h3, h4";
const BLOCKS = "p, li, h1, h2, h3, h4, blockquote, pre, table, figure";
const LABEL_MAX = 44;
const MIN_QUOTE = 3;
const SUPPRESS_ID = "sidecar-suppress";
const EDIT_ID = "sidecar-edit";

interface Indexed {
  el: HTMLElement;
  key: string;
  label: string;
  text: string;
}

const frame = ref<HTMLIFrameElement>();
const height = ref(0);
const loaded = ref(false);

let watchers: (() => void)[] = [];
let indexed: Indexed[] = [];

function norm(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

// The frame is a second realm, so `instanceof Element` from here is always false; duck-typing is the only test.
function blockAt(target: unknown): Element | undefined {
  const node = target as { closest?: (selectors: string) => Element | null } | undefined; // external contract: DOM closest()
  return node?.closest?.(BLOCKS) ?? undefined;
}

function labelOf(el: Element): string {
  return norm(el.closest(HOSTS)?.querySelector(HEADINGS)?.textContent).slice(0, LABEL_MAX);
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

// Walked once per load, so a mark keeps its key while the page reflows under it.
function indexBlocks(doc: Document): void {
  indexed = [];
  for (const el of doc.querySelectorAll<HTMLElement>(BLOCKS)) {
    // A figure wrapping a paragraph would otherwise carry a second, overlapping mark.
    if (el.querySelector(BLOCKS)) continue;
    const text = norm(el.textContent);
    if (!text) continue;
    indexed.push({ el, key: `${indexed.length}:${el.tagName.toLowerCase()}`, label: labelOf(el), text });
  }
}

function measure(doc: Document): FrameMark[] {
  const scroll = doc.documentElement.scrollTop;
  return indexed.map(({ el, key, label, text }) => {
    const box = el.getBoundingClientRect();
    return { height: box.height, key, label, text, top: box.top + scroll };
  });
}

function markFor(doc: Document, node?: Node): FrameMark | undefined {
  const held = indexed.find((one) => node && one.el.contains(node));
  if (!held) return undefined;
  const box = held.el.getBoundingClientRect();
  const scroll = doc.documentElement.scrollTop;
  return { height: box.height, key: held.key, label: held.label, text: held.text, top: box.top + scroll };
}

function teardown(): void {
  for (const off of watchers) off();
  watchers = [];
  indexed = [];
}

function reset(): void {
  loaded.value = false;
  height.value = 0;
  teardown();
  emit("anchors", []);
  emit("block", undefined);
  emit("pending", []);
  emit("select", undefined);
}

function onLoad(): void {
  teardown();
  const doc = frame.value?.contentDocument;
  if (!doc) return;

  indexBlocks(doc);

  // documentElement.scrollHeight floors at the viewport, so a tall boot frame would never shrink back.
  const remeasure = (): void => {
    height.value = doc.body?.scrollHeight || doc.documentElement.scrollHeight;
    emit("anchors", readAnchors(doc));
    emit("marks", measure(doc));
    emit("pending", readPending(doc));
  };

  syncTheme(doc);
  hidePageToggle(doc);
  injectEditStyle(doc);
  remeasure();
  loaded.value = true;

  const resize = new ResizeObserver(remeasure);
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

  const onSelect = (): void => {
    const selection = doc.getSelection();
    const quote = norm(selection?.toString());
    if (!selection || selection.isCollapsed || quote.length < MIN_QUOTE) {
      emit("select", undefined);
      return;
    }
    const mark = markFor(doc, selection.anchorNode ?? undefined);
    if (!mark) {
      emit("select", undefined);
      return;
    }
    const box = selection.getRangeAt(0).getBoundingClientRect();
    const scroll = doc.documentElement.scrollTop;
    emit("select", {
      bottom: box.bottom + scroll,
      left: box.left + box.width / 2,
      mark,
      quote,
      top: box.top + scroll,
    });
  };

  const onKey = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
    event.preventDefault();
    onSelect();
    emit("edit");
  };

  doc.addEventListener("mousemove", onMove);
  doc.addEventListener("mouseleave", onLeave);
  doc.addEventListener("mouseup", onSelect);
  doc.addEventListener("keyup", onSelect);
  doc.addEventListener("keydown", onKey);
  watchers.push(() => {
    doc.removeEventListener("mousemove", onMove);
    doc.removeEventListener("mouseleave", onLeave);
    doc.removeEventListener("mouseup", onSelect);
    doc.removeEventListener("keyup", onSelect);
    doc.removeEventListener("keydown", onKey);
  });
}

function clearSelection(): void {
  frame.value?.contentDocument?.getSelection()?.removeAllRanges();
  emit("select", undefined);
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

function injectEditStyle(doc: Document): void {
  if (doc.getElementById(EDIT_ID)) return;
  const style = doc.createElement("style");
  style.id = EDIT_ID;
  style.textContent = `del[data-sc-edit]{color:var(--error);text-decoration:line-through}ins[data-sc-edit]{background:color-mix(in oklch,var(--success) 16%,transparent);color:var(--success);text-decoration:none}`;
  doc.head?.append(style);
}

function readPending(doc: Document): FramePending[] {
  const out: FramePending[] = [];
  const seen = new Set<string>();
  for (const del of doc.querySelectorAll("del[data-sc-edit]")) {
    const id = del.getAttribute("data-sc-edit") ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ins = doc.querySelector(`ins[data-sc-edit="${CSS.escape(id)}"]`);
    const box = (ins ?? del).getBoundingClientRect();
    const scroll = doc.documentElement.scrollTop;
    out.push({
      id,
      left: box.right,
      replacement: norm(ins?.textContent || undefined),
      selection: norm(del.textContent || undefined),
      top: box.top + scroll,
    });
  }
  return out;
}

onMounted(() => {
  const observer = new MutationObserver(() => {
    const doc = frame.value?.contentDocument;
    if (doc) syncTheme(doc);
  });
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  onScopeDispose(() => observer.disconnect());
});

watch(() => [edition, html, slug, version], reset);

onScopeDispose(teardown);

defineExpose({ clearSelection });
</script>

<template>
  <div class="sheet" :data-loaded="loaded ? '' : undefined">
    <iframe
      ref="frame"
      :key="`${slug}:${version ?? 'head'}:${edition ?? 0}`"
      :src="html ? undefined : `/artifact/${slug}`"
      :srcdoc="html"
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
