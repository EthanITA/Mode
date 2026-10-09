<script lang="ts" setup>
import { FilePen, FilePlus2, FolderTree, Maximize2, PanelsTopLeft } from "@lucide/vue";
import { useEventListener, useLocalStorage } from "@vueuse/core";
import type { Component, ComponentPublicInstance } from "vue";
import type { FileGroup, SessionFile } from "~~/shared/types/files";
import type { TreeEntry } from "~~/shared/types/tree";

type Scope = "artifacts" | "all" | FileGroup;

const SIDE = 340;
const side = useLocalStorage("sc:pane:files", SIDE);

const sc = useSidecar();
const files = useFiles(() => sc.sessionKey.value);
const selected = useState<string | undefined>("fl:selected");
const scope = useState<Scope>("fl:scope", () => "artifacts");
const showIgnored = useState("fl:ignored", () => false);

const SCOPES = [
  { hint: "Pages this conversation made", icon: PanelsTopLeft, label: "Artifacts", value: "artifacts" },
  { hint: "The whole folder", icon: FolderTree, label: "All", value: "all" },
  { hint: "Files Claude created", icon: FilePlus2, label: "Produced", value: "produced" },
  { hint: "Files Claude read or changed", icon: FilePen, label: "Interacted", value: "interacted" },
] satisfies { hint: string; icon: Component; label: string; value: Scope }[];

const EMPTY: Record<Exclude<Scope, "all">, string> = {
  artifacts: "This conversation hasn't made an artifact yet.",
  produced: "This conversation hasn't created a file yet.",
  interacted: "This conversation hasn't read or changed a file yet.",
};

const session = computed(() => sc.sessions.value.find((s) => s.key === sc.sessionKey.value));
const touched = computed(() => new Map((files.value?.files ?? []).map((file) => [file.path, file])));
// The dot is solid for whatever the most recent turn that touched a file read or edited.
const latest = computed(() => (files.value?.files ?? []).reduce((at, one) => Math.max(at, one.lastTurn), 0));

const folder = useFolderTree({
  key: () => sc.sessionKey.value ?? "",
  root: () => session.value?.cwd ?? "",
  showIgnored,
});
// Every page the catalogue holds opens as an artifact, stamped on this conversation or not.
const pages = computed(() => new Map(sc.catalogue.value.map((meta) => [meta.path, meta.slug])));
const artifacts = computed(() => {
  const paths = new Map(sc.catalogue.value.map((meta) => [meta.slug, meta.path]));
  return (session.value?.artifacts ?? []).flatMap((slug) => paths.get(slug) ?? []);
});

const scoped = usePathsTree(() =>
  scope.value === "artifacts"
    ? artifacts.value
    : (files.value?.files ?? []).filter((file) => file.group === scope.value).map((file) => file.path),
);
const source = computed(() => (scope.value === "all" ? folder : scoped));
const pageOf = computed(() => (selected.value ? pages.value.get(selected.value) : undefined));

// A new turn can create or delete files, so the folders already open are listed again.
watch(latest, () => folder.refresh());

watch(
  [scope, artifacts],
  () => {
    if (scope.value === "artifacts" && !selected.value) selected.value = artifacts.value[0];
  },
  { immediate: true },
);

function markOf(entry: TreeEntry): SessionFile | undefined {
  return entry.kind === "file" ? touched.value.get(entry.path) : undefined;
}

type Box = { height: number; left: number; top: number; width: number };

// The sheet itself grows, so the frame inside it never reloads; --ease-drawer at a sheet's pace.
const GROW = { duration: 380, easing: "cubic-bezier(0.32, 0.72, 0, 1)" } satisfies KeyframeAnimationOptions;

const isFull = useArtifactFullscreen();
const look = useArtifactTheme();
const isExpanded = ref(false);
const slot = useTemplateRef<HTMLElement>("slot");
const preview = useTemplateRef<ComponentPublicInstance>("preview");
const bar = useTemplateRef<HTMLElement>("bar");
const read = useTemplateRef<HTMLElement>("read");
let rest = { pad: 0, radius: "0px" };
let growth: Animation | undefined;

function boxOf(el: Element, frame: Element): Box {
  const box = el.getBoundingClientRect();
  const origin = frame.getBoundingClientRect();
  return { height: box.height, left: box.left - origin.left, top: box.top - origin.top, width: box.width };
}

function frameOf({ height, left, top, width }: Box, radius: string, depth: "lg" | "sm"): Keyframe {
  const shadow = getComputedStyle(document.documentElement).getPropertyValue(`--shadow-${depth}`).trim();
  return { borderRadius: radius, boxShadow: shadow, height: `${height}px`, left: `${left}px`, top: `${top}px`, width: `${width}px` };
}

async function expand(): Promise<void> {
  const pane = preview.value?.$el;
  if (!(pane instanceof HTMLElement) || !slot.value) return;
  const stage = pane.offsetParent ?? document.body;
  const from = boxOf(slot.value, stage);
  const pad = read.value ? Number.parseFloat(getComputedStyle(read.value).paddingTop) + (bar.value?.offsetHeight ?? 0) : 0;
  rest = { pad, radius: getComputedStyle(pane).borderRadius };
  isExpanded.value = true;
  await nextTick();
  if (prefersReducedMotion()) return;
  growth?.cancel();
  growth = pane.animate([frameOf(from, rest.radius, "sm"), frameOf(boxOf(pane, stage), "0px", "lg")], GROW);
  if (read.value) read.value.animate([{ paddingTop: `${pad}px` }, { paddingTop: getComputedStyle(read.value).paddingTop }], GROW);
}

async function collapse(): Promise<void> {
  const pane = preview.value?.$el;
  if (!(pane instanceof HTMLElement) || !slot.value || !isExpanded.value || prefersReducedMotion()) {
    isExpanded.value = false;
    return;
  }
  const stage = pane.offsetParent ?? document.body;
  growth?.cancel();
  // Held on its last frame until the class comes off, or the sheet would flash full size for a frame.
  const shrink = pane.animate([frameOf(boxOf(pane, stage), "0px", "lg"), frameOf(boxOf(slot.value, stage), rest.radius, "sm")], {
    ...GROW,
    fill: "forwards",
  });
  const settle = read.value?.animate([{ paddingTop: getComputedStyle(read.value).paddingTop }, { paddingTop: `${rest.pad}px` }], {
    ...GROW,
    fill: "forwards",
  });
  growth = shrink;
  await shrink.finished.catch(() => undefined);
  if (growth !== shrink) return;
  isExpanded.value = false;
  await nextTick();
  shrink.cancel();
  settle?.cancel();
}

watch(isFull, (full) => void (full ? expand() : collapse()));
watch([selected, () => sc.sessionKey.value], () => {
  isFull.value = false;
});
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.key === "Escape" && !event.defaultPrevented && isFull.value) isFull.value = false;
});
onBeforeUnmount(() => {
  isFull.value = false;
});
</script>

<template>
  <section class="files" data-region="files" :style="{ '--side-w': `${side}px` }">
    <UiSurface class="pane" data-region="files-table" pad="none" variant="raised">
      <header class="bar scopes">
        <UiSegmented v-model="scope" :options="SCOPES" />
      </header>
      <div v-if="session && scope === 'all'" class="root">
        <span class="where mono-meta" :title="session.cwd">{{ homePath(session.cwd) }}</span>
        <UiChip :selected="showIgnored" size="xs" @click="showIgnored = !showIgnored">Ignored</UiChip>
      </div>
      <div class="scroll">
        <p v-if="!sc.sessionKey.value" class="empty">No conversation is selected.</p>
        <p v-else-if="scope !== 'all' && !scoped.root.value" class="empty">{{ EMPTY[scope] }}</p>
        <FileTree
          v-else
          :key="`${scope}:${sc.sessionKey.value}`"
          :is-open-by-default="scope !== 'all'"
          :selected="selected"
          :source="source"
          @select="selected = $event"
        >
          <template #trailing="{ entry }">
            <span
              v-if="markOf(entry)"
              class="dot"
              :data-group="markOf(entry)?.group"
              :data-latest="markOf(entry)?.lastTurn === latest"
              :title="`${markOf(entry)?.group === 'produced' ? 'Created' : 'Read or changed'} in this conversation, last ${markOf(entry)?.lastAction} in turn ${markOf(entry)?.lastTurn}`"
            />
          </template>
        </FileTree>
      </div>
    </UiSurface>

    <PaneResizer v-model="side" :initial="SIDE" label="Resize the file tree" />

    <div ref="slot" class="slot">
      <UiSurface
        ref="preview"
        class="pane preview"
        data-region="files-preview"
        :data-expanded="isExpanded"
        :data-pane-theme="pageOf ? look.theme.value : undefined"
        pad="none"
        variant="raised"
      >
        <template v-if="selected && pageOf && sc.sessionKey.value">
          <header ref="bar" class="bar">
            <span class="path">{{ homePath(selected) }}</span>
            <ChromeCommentToggle shape="pill" />
            <ArtifactThemeToggle shape="pill" />
            <ChromeAction
              data-region="artifact-fullscreen"
              :icon="Maximize2"
              label="Fullscreen"
              shape="pill"
              tip="Grow the page over everything · esc shrinks it back"
              @click="isFull = true"
            />
          </header>
          <div ref="read" class="read">
            <ArtifactReader :conversation="sc.sessionKey.value" :slug="pageOf" />
          </div>
        </template>
        <FilesEditor
          v-else-if="selected && sc.sessionKey.value"
          :conversation="sc.sessionKey.value"
          :path="selected"
          :turn="touched.get(selected)?.lastTurn"
        />
        <p v-else class="empty centered">Pick a file to open it here.</p>
      </UiSurface>
    </div>
  </section>
</template>

<style scoped>
/* The middle track is the resizer's; half the face caps a width remembered from a wider window. */
.files {
  column-gap: 8px;
  display: grid;
  grid-template-columns: min(var(--side-w), 50%) 0 minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* The slot keeps the grid track while the sheet inside it grows out, and is where it shrinks back to. */
.slot {
  display: flex;
  min-height: 0;
  min-width: 0;
}

.preview {
  flex: 1;
  min-width: 0;
}

/* Absolute against the face's stage: over the whole face, and still under the island and dock rows. */
.preview[data-expanded="true"] {
  border-radius: 0;
  box-shadow: var(--shadow-lg);
  inset: 0;
  position: absolute;
  z-index: 10;
}

.preview[data-expanded="true"] .bar {
  display: none;
}

.preview[data-expanded="true"] .read {
  padding: var(--stage-top) 0 calc(var(--dock-h, var(--dock-rest-h)) + var(--gutter) * 2);
}

.bar {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 8px 12px;
}

/* The scopes fill the row while their labels fit, and fall back to icons with the label as a tooltip below that. */
.scopes {
  container-type: inline-size;
}

.scopes :deep(.segmented) {
  display: flex;
  width: 100%;
}

.scopes :deep(.segmented-option) {
  flex: 1 1 auto;
  justify-content: center;
  padding-inline: 10px;
}

.scopes :deep(.segmented-option svg) {
  display: none;
}

@container (width < 280px) {
  .scopes :deep(.segmented-option) {
    font-size: 0;
    gap: 0;
  }

  .scopes :deep(.segmented-option svg) {
    display: block;
  }
}

.root {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 5px 8px 5px 14px;
}

.where {
  color: var(--subtle);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 6px 16px;
}

.dot {
  border: 1.5px solid currentColor;
  border-radius: 999px;
  flex: none;
  height: 7px;
  width: 7px;
}

.dot[data-group="produced"] {
  color: var(--success);
}

.dot[data-group="interacted"] {
  color: var(--info);
}

.dot[data-latest="true"] {
  background: currentColor;
}

.path {
  flex: 1;
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* The reader sizes its frame to the page, so this pane owns the scroll. */
.read {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 0 24px;
}

.empty {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
  padding: 8px;
}

.centered {
  display: grid;
  flex: 1;
  place-items: center;
  padding: 16px;
}
</style>
