<script lang="ts" setup>
import { Check, X } from "@lucide/vue";
import { useIntersectionObserver } from "@vueuse/core";
import type * as MonacoApi from "monaco-editor";
import { EditorNotes, type LineSpan, type NoteAt, type Notes } from "~/utils/monaco/notes";
import { OneDarkVivid } from "~/utils/monaco/one-dark-vivid";
import type { ReviewFile } from "~~/shared/types/review";

type Side = "old" | "new";
type HunkAt = { change: number; top: number };

const {
  file,
  isCompact = true,
  isWrapped = true,
  isReadonly = false,
  isBusy = false,
  isFill = false,
  picks = [],
} = defineProps<{
  file: ReviewFile;
  isCompact?: boolean;
  isWrapped?: boolean;
  /** History only reads; Review also picks lines and takes whole hunks. */
  isReadonly?: boolean;
  isBusy?: boolean;
  /** Fills a parent with a height of its own; otherwise the diff is as tall as its lines, up to --transcript-max-h. */
  isFill?: boolean;
  picks?: string[];
}>();

const emit = defineEmits<{
  "update:picks": [keys: string[]];
  hunk: [change: number, isAccept: boolean, event: MouseEvent];
}>();

const LINE_HEIGHT = 18;
const ESTIMATE_MAX = 480;

const chrome = useChrome();
const tray = useTray();
const host = useTemplateRef<HTMLElement>("host");
// A turn can touch dozens of files, so a card builds its editor only once it scrolls near the view.
const isNear = ref(isFill);
const contentHeight = ref(Math.min(Math.max(file.original.length, file.current.length) * LINE_HEIGHT + 8, ESTIMATE_MAX));
const hunks = ref<HunkAt[]>([]);
const seam = ref(0);

let api: typeof MonacoApi | undefined;
let diff: MonacoApi.editor.IStandaloneDiffEditor | undefined;
let models: MonacoApi.editor.ITextModel[] = [];
let pens: Notes[] = [];
let picked: MonacoApi.editor.IEditorDecorationsCollection[] = [];
let lastPicks = "";
let modelSeq = 0;

const shown = computed(() => homePath(file.path));
// Every changed row once, with the key a pick names it by, whichever side it is read from.
const changeRows = computed(() => Review.rows({ file, isCompact: false, unfolded: [] }).filter((row) => row.kind === "change"));
const keyOf = computed(() => ({
  new: new Map(changeRows.value.filter((row) => row.new >= 0).map((row) => [row.new + 1, row.key])),
  old: new Map(changeRows.value.filter((row) => row.old >= 0).map((row) => [row.old + 1, row.key])),
}));
const notes = computed(() => tray.items.value.filter((item) => item.file === shown.value && !!item.path));

function textOf(lines: readonly string[]): string {
  return lines.join("\n");
}

function editorOf(side: Side): MonacoApi.editor.ICodeEditor | undefined {
  return side === "old" ? diff?.getOriginalEditor() : diff?.getModifiedEditor();
}

// Selecting lines in either pane is the pick, so line numbers, drags and shift-clicks all work as in any editor.
function pickFrom(side: Side): void {
  const editor = editorOf(side);
  if (isReadonly || !editor) return;
  const keys = new Set<string>();
  for (const selection of editor.getSelections() ?? []) {
    if (selection.isEmpty()) continue;
    const end = selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber ? selection.endLineNumber - 1 : selection.endLineNumber;
    for (let line = selection.startLineNumber; line <= end; line++) {
      const key = keyOf.value[side].get(line);
      if (key) keys.add(key);
    }
  }
  const next = [...keys];
  const signature = [...next].sort().join();
  if (signature === lastPicks) return;
  lastPicks = signature;
  emit("update:picks", next);
}

function paintPicks(): void {
  if (!api) return;
  const Range = api.Range;
  const chosen = changeRows.value.filter((row) => picks.includes(row.key));
  const lines = { new: chosen.filter((row) => row.new >= 0).map((row) => row.new + 1), old: chosen.filter((row) => row.old >= 0).map((row) => row.old + 1) };
  (["old", "new"] as const).forEach((side, index) => {
    picked[index]?.set(
      lines[side].map((line) => ({
        options: { className: "monaco-picked", isWholeLine: true, lineNumberClassName: "monaco-picked-number" },
        range: new Range(line, 1, line, 1),
      })),
    );
  });
}

// The two panes scroll together, so a hunk's top in whichever pane holds its lines is where its arrows sit.
function placeHunks(): void {
  const original = editorOf("old");
  const modified = editorOf("new");
  if (isReadonly || !original || !modified) return;
  seam.value = original.getLayoutInfo().width;
  hunks.value = file.changes.map((change, index) => {
    const pane = change.newEnd > change.newStart ? modified : original;
    const line = (change.newEnd > change.newStart ? change.newStart : change.oldStart) + 1;
    return { change: index, top: pane.getTopForLineNumber(line) - pane.getScrollTop() };
  });
}

function openNote(side: Side, { lines, quote, x, y }: NoteAt): void {
  const span = EditorNotes.spanOf(lines);
  const where = side === "old" ? `original ${span}` : span;
  chrome.comment.open({
    excerpt: quote,
    file: shown.value,
    kind: "line",
    label: `${basename(file.path)}:${lines[0] === lines[1] ? lines[0] : lines.join("-")}`,
    path: where,
    quote,
    tell: side === "old" ? `About the original ${span} of ${shown.value}:` : `About ${span} of ${shown.value}:`,
    x,
    y,
  });
}

function paintNotes(): void {
  (["old", "new"] as const).forEach((side, index) => {
    const spans = notes.value.flatMap((item) => {
      const isOriginal = item.path?.startsWith("original") ?? false;
      const lines: LineSpan | undefined = EditorNotes.parse(item.path ?? "");
      return lines && isOriginal === (side === "old") ? [{ lines, text: item.text }] : [];
    });
    pens[index]?.paint(spans);
  });
}

function setModels(): void {
  if (!api || !diff) return;
  const [original, modified] = models;
  if (original && modified) {
    if (original.getValue() !== textOf(file.original)) original.setValue(textOf(file.original));
    if (modified.getValue() !== textOf(file.current)) modified.setValue(textOf(file.current));
    return;
  }
  // The URI's extension picks the language, and a sequence keeps two cards of one file apart.
  const seq = ++modelSeq;
  const uriOf = (side: string): MonacoApi.Uri =>
    api!.Uri.from({ path: `/${side}-${seq}/${basename(file.path)}`, scheme: "inmemory" });
  models = [
    api.editor.createModel(textOf(file.original), Monaco.languageOf(file.path), uriOf("original")),
    api.editor.createModel(textOf(file.current), Monaco.languageOf(file.path), uriOf("modified")),
  ];
  diff.setModel({ modified: models[1]!, original: models[0]! });
}

async function build(): Promise<void> {
  api = await Monaco.load();
  if (!host.value || diff) return;
  diff = api.editor.createDiffEditor(host.value, {
    automaticLayout: true,
    diffWordWrap: isWrapped ? "on" : "off",
    fixedOverflowWidgets: true,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || undefined,
    fontSize: 12,
    glyphMargin: true,
    hideUnchangedRegions: { contextLineCount: 3, enabled: isCompact, minimumLineCount: 4, revealLineCount: 20 },
    ignoreTrimWhitespace: false,
    lineHeight: LINE_HEIGHT,
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    originalEditable: false,
    readOnly: true,
    renderGutterMenu: false,
    renderMarginRevertIcon: false,
    renderOverviewRuler: false,
    renderSideBySide: true,
    // A card inside History's scrolling list hands the wheel back once its own lines run out.
    scrollbar: { alwaysConsumeMouseWheel: isFill },
    scrollBeyondLastLine: false,
    theme: OneDarkVivid.name,
    useInlineViewWhenSpaceIsLimited: false,
    wordWrap: isWrapped ? "on" : "off",
  });
  setModels();
  const sides = [diff.getOriginalEditor(), diff.getModifiedEditor()];
  pens = sides.map((editor, index) =>
    EditorNotes.attach({ api: api!, editor, onNote: (at) => openNote(index === 0 ? "old" : "new", at) }),
  );
  picked = sides.map((editor) => editor.createDecorationsCollection());
  for (const [index, editor] of sides.entries()) {
    editor.onDidChangeCursorSelection(() => pickFrom(index === 0 ? "old" : "new"));
    editor.onDidScrollChange(placeHunks);
    editor.onDidLayoutChange(placeHunks);
    editor.onDidContentSizeChange(() => {
      contentHeight.value = Math.max(...sides.map((one) => one.getContentHeight()));
    });
  }
  diff.onDidUpdateDiff(() => {
    contentHeight.value = Math.max(...sides.map((one) => one.getContentHeight()));
    placeHunks();
  });
  paintPicks();
  paintNotes();
}

useIntersectionObserver(
  host,
  ([entry]) => {
    if (entry?.isIntersecting) isNear.value = true;
  },
  { rootMargin: "600px" },
);

onMounted(() => watch(isNear, (near) => near && void build(), { immediate: true }));
watch(() => [file.original, file.current], setModels);
watch(() => file.changes, placeHunks);
watch(
  () => [isCompact, isWrapped] as const,
  ([compact, wrapped]) =>
    diff?.updateOptions({
      diffWordWrap: wrapped ? "on" : "off",
      hideUnchangedRegions: { enabled: compact },
      wordWrap: wrapped ? "on" : "off",
    }),
);
watch(
  () => picks,
  (next) => {
    lastPicks = [...next].sort().join();
    paintPicks();
  },
);
watch(notes, paintNotes);

onBeforeUnmount(() => {
  for (const pen of pens) pen.dispose();
  diff?.dispose();
  for (const model of models) model.dispose();
});
</script>

<template>
  <div
    class="sbs"
    data-region="diff-side-by-side"
    :data-fill="isFill"
    :style="[OneDarkVivid.cssVars, isFill ? {} : { height: `${contentHeight}px` }]"
  >
    <div ref="host" class="host" />
    <div v-if="!isReadonly && hunks.length" class="hunks" :style="{ left: `${seam}px` }">
      <div
        v-for="hunk in hunks"
        v-show="hunk.top > -LINE_HEIGHT && (isFill || hunk.top < contentHeight)"
        :key="hunk.change"
        class="hunk"
        :style="{ top: `${hunk.top}px` }"
      >
        <button
          class="arrow focusable"
          type="button"
          data-tip="Accept the hunk"
          data-tone="accept"
          :disabled="isBusy"
          @click="emit('hunk', hunk.change, true, $event)"
        >
          <UiIcon :icon="Check" size="xs" />
        </button>
        <button
          class="arrow focusable"
          type="button"
          data-tip="Reject the hunk, then say why"
          data-tone="reject"
          :disabled="isBusy"
          @click="emit('hunk', hunk.change, false, $event)"
        >
          <UiIcon :icon="X" size="xs" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sbs {
  background: var(--ed-bg);
  max-height: var(--transcript-max-h);
  overflow: hidden;
  position: relative;
}

.sbs[data-fill="true"] {
  height: 100%;
  max-height: none;
}

.host {
  height: 100%;
  width: 100%;
}

/* Pinned to the seam between the panes, over the original's right edge where its scrollbar would be. */
.hunks {
  inset: 0 auto 0 0;
  pointer-events: none;
  position: absolute;
  width: 0;
}

.hunk {
  background: var(--ed-bar);
  border: 1px solid var(--ed-button);
  border-radius: 999px;
  display: flex;
  gap: 1px;
  padding: 1px;
  pointer-events: auto;
  position: absolute;
  right: 4px;
  z-index: 5;
}

.arrow {
  align-items: center;
  background: none;
  border: 0;
  border-radius: 999px;
  color: var(--ed-muted);
  cursor: pointer;
  display: grid;
  height: 16px;
  justify-items: center;
  padding: 0;
  width: 20px;
}

@media (hover: hover) and (pointer: fine) {
  .arrow:hover:not(:disabled) {
    background: var(--ed-button);
  }

  .arrow[data-tone="accept"]:hover:not(:disabled) {
    color: var(--ed-add);
  }

  .arrow[data-tone="reject"]:hover:not(:disabled) {
    color: var(--ed-remove);
  }
}

.arrow:disabled {
  cursor: progress;
  opacity: 0.5;
}
</style>
