<script lang="ts" setup>
import type { FrameAnchor, FrameMark, FramePending } from "~/types/frame";
import { measure, readAnchors, readPending } from "~~/lib/web/page/blocks";

const {
  canAsk = false,
  canEdit = false,
  edition,
  file,
  html,
  inset = 0,
  slug,
  src,
  version,
} = defineProps<{
  canAsk?: boolean;
  canEdit?: boolean;
  edition?: number;
  file?: string;
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

const look = useTheme();

const frame = ref<HTMLIFrameElement>();
const height = ref(0);
const loaded = ref(false);
let loadGen = 0;

const pick = useCommentPick({
  edit: () => emit("edit"),
  frame,
  inset: () => inset,
  // documentElement.scrollHeight floors at the viewport, so a tall boot frame would never shrink back.
  measure: (doc, indexed) => {
    height.value = doc.body?.scrollHeight || doc.documentElement.scrollHeight;
    emit("anchors", readAnchors(doc, doc.documentElement.scrollTop));
    emit("marks", measure(indexed, doc.documentElement.scrollTop));
    emit("pending", readPending(doc, doc.documentElement.scrollTop));
  },
  owner: () => ({ canAsk, canEdit, file, slug }),
});

function reset(): void {
  loadGen += 1;
  loaded.value = false;
  height.value = 0;
  pick.detach();
  emit("anchors", []);
  emit("pending", []);
}

// A receipt opens away rather than in here, which would navigate the artifact out of its own frame.
function onLink(event: MouseEvent): void {
  const link = (event.target as Element | undefined)?.closest?.("a[href^='http']");
  if (!link) return;
  event.preventDefault();
  window.open(link.getAttribute("href") ?? "", "_blank", "noopener");
}

function onLoad(): void {
  const doc = frame.value?.contentDocument;
  if (!doc) return;
  const gen = loadGen;
  syncTheme(doc);
  suppressPageChrome(doc);
  injectEditStyle(doc);
  doc.addEventListener("click", onLink, true);
  pick.attach();
  loaded.value = true;
  void nextTick(() => {
    if (gen !== loadGen) return;
    emit("ready");
  });
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

watch(() => [edition, html, slug, version], reset);

defineExpose({ clearPick: pick.clearPick });
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
