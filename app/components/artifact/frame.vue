<script lang="ts" setup>
import type { FrameAnchor, FrameHit, FrameMark, FramePending } from "~/types/frame";

const { edition, html, slug, version } = defineProps<{
  edition?: number;
  html?: string;
  slug: string;
  version?: number;
}>();

const emit = defineEmits<{
  anchors: [anchors: FrameAnchor[]];
  edit: [];
  marks: [marks: FrameMark[]];
  pending: [edits: FramePending[]];
  ready: [];
}>();

// Mirrors labelOf() in the review layer: the anchor label is the host section's own heading.
const HOSTS = "section, article, figure, .panel, .stage";
const HEADINGS = "h1, h2, h3, h4";
// A block is whatever a container holds directly, so an unnamed div is as pickable as a <p>.
const WALK = "body, main, section, article, .page, .panel, .stage";
const OUTER = `html, ${WALK}`;
const OWN = "li, tr, dt, dd, figcaption";
const SKIP = "script, style, template, noscript";
const LABEL_MAX = 44;
const SUPPRESS_ID = "sidecar-suppress";
const EDIT_ID = "sidecar-edit";

interface Indexed {
  el: Element;
  key: string;
  label: string;
  text: string;
}

const chrome = useChrome();

const frame = ref<HTMLIFrameElement>();
const height = ref(0);
const loaded = ref(false);

let watchers: (() => void)[] = [];
let indexed: Indexed[] = [];
let hot: Element | undefined;
let picked: Element | undefined;
let raf = 0;
let loadGen = 0;

function norm(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function boxy(el: Element): boolean {
  const display = el.ownerDocument?.defaultView?.getComputedStyle(el).display ?? "block";
  return display !== "inline" && display !== "contents";
}

// A wrapper holding one block child with the same words is not a block of its own.
function tighten(el: Element): Element {
  let node = el;
  for (;;) {
    const [only] = node.children;
    if (node.children.length !== 1 || !only || !boxy(only)) return node;
    if (norm(node.textContent) !== norm(only.textContent)) return node;
    node = only;
  }
}

// The frame is a second realm, so `instanceof Element` from here is always false; duck-typing is the only test.
function blockAt(target: unknown): Element | undefined {
  const node = target as Element | undefined;
  if (!node?.closest) return undefined;
  const own = node.closest(OWN);
  if (own) return own;
  let el: Element | undefined = node;
  while (el?.parentElement && !el.parentElement.matches(OUTER)) el = el.parentElement;
  return el && !el.matches(OUTER) && !el.matches(SKIP) ? tighten(el) : undefined;
}

function pathOf(node: Element): string {
  const parts: string[] = [];
  const doc = node.ownerDocument;
  for (let n: Element | undefined = node; n && n !== doc?.body; n = n.parentElement ?? undefined) {
    if (n.id) {
      const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(n.id) : n.id;
      parts.unshift(`#${id}`);
      break;
    }
    const tag = n.tagName.toLowerCase();
    const parent = n.parentElement;
    const kin = parent ? [...parent.children].filter((c) => c.tagName === n.tagName) : [];
    parts.unshift(kin.length > 1 ? `${tag}:nth-of-type(${kin.indexOf(n) + 1})` : tag);
  }
  return parts.join(" > ");
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

// The mirror of blockAt(): a pick this walk misses has no key and cannot be anchored.
function indexBlocks(doc: Document): void {
  indexed = [];
  const held = new Set<Element>();
  const take = (el: Element): void => {
    if (held.has(el) || el.matches(SKIP)) return;
    const text = norm(el.textContent);
    if (!text) return;
    held.add(el);
    indexed.push({
      el,
      key: `${indexed.length}:${el.tagName.toLowerCase()}`,
      label: labelOf(el) || text.slice(0, LABEL_MAX),
      text,
    });
  };
  for (const host of doc.querySelectorAll(WALK)) {
    for (const child of host.children) {
      if (!child.matches(OUTER)) take(tighten(child));
    }
  }
  for (const el of doc.querySelectorAll(OWN)) take(el);
}

function measure(doc: Document): FrameMark[] {
  const scroll = doc.documentElement.scrollTop;
  return indexed.map(({ el, key, label, text }) => {
    const box = el.getBoundingClientRect();
    return { height: box.height, key, label, text, top: box.top + scroll };
  });
}

function indexedOf(el: Element): Indexed | undefined {
  return indexed.find((one) => one.el === el) ?? indexed.find((one) => el.contains(one.el));
}

function hitOf(el: Element): FrameHit | undefined {
  const held = indexedOf(el);
  const box = el.getBoundingClientRect();
  const frameBox = frame.value?.getBoundingClientRect();
  const doc = el.ownerDocument;
  if (!held || !frameBox || !doc) return undefined;
  const scroll = doc.documentElement.scrollTop;
  return {
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
  if (!doc || !hit) return undefined;
  const want = hit.text.slice(0, 160);
  if (want) {
    const exact = indexed.filter((one) => one.text.slice(0, 160) === want);
    if (exact[0]) return exact[0].el;
    const head = want.slice(0, 60);
    const near = indexed.filter((one) => one.text.startsWith(head));
    if (near[0]) return near[0].el;
  }
  try {
    return hit.path ? (doc.querySelector(hit.path) ?? undefined) : undefined;
  } catch {
    return undefined;
  }
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

  indexBlocks(doc);

  // documentElement.scrollHeight floors at the viewport, so a tall boot frame would never shrink back.
  const remeasure = (): void => {
    height.value = doc.body?.scrollHeight || doc.documentElement.scrollHeight;
    emit("anchors", readAnchors(doc));
    emit("marks", measure(doc));
    emit("pending", readPending(doc));
  };

  syncTheme(doc);
  suppressPageChrome(doc);
  injectEditStyle(doc);
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
    if (chrome.comment.spot.value) return;
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
    const node = blockAt(event.target);
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    picked = node;
    hot = node;
    const hit = hitOf(node);
    if (hit) chrome.comment.compose(hit);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (picked || hot) emit("edit");
      else chrome.jump.toggle();
      return;
    }
    if (event.key === "Escape") {
      if (chrome.dismiss()) event.preventDefault();
      return;
    }
    if (meta || event.altKey) return;
    if (event.key.toLowerCase() === "c" && !event.repeat) chrome.comment.arm(true);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === "c") chrome.comment.release();
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
      emit("anchors", readAnchors(doc));
      emit("marks", measure(doc));
      emit("pending", readPending(doc));
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

// The artifact carries its own theme stamp, so the frame follows the app's toggle rather than the OS.
function syncTheme(doc: Document): void {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) doc.documentElement.setAttribute("data-theme", theme);
}

// The page ships its own theme toggle and the frame is sized to its content: both would be a second one over the app.
function suppressPageChrome(doc: Document): void {
  if (doc.getElementById(SUPPRESS_ID)) return;
  const style = doc.createElement("style");
  style.id = SUPPRESS_ID;
  style.textContent = ".theme-toggle{display:none !important}html{overflow:hidden !important}";
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
    const host = del.parentElement;
    if (!host) continue;
    const box = (ins ?? del).getBoundingClientRect();
    const scroll = doc.documentElement.scrollTop;
    out.push({
      id,
      left: box.right,
      path: pathOf(host),
      replacement: norm(ins?.textContent || undefined),
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

watch(chrome.comment.pick, (hit) => {
  if (hit) return;
  picked = undefined;
});

defineExpose({ clearPick });
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
