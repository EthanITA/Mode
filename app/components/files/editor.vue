<script lang="ts">
type Disk = { hash: string; text: string };

// Module-wide, so an unsaved draft outlives switching files and leaving the face.
const disk = new Map<string, Disk>();
const unsaved = new Set<string>();
</script>

<script lang="ts" setup>
import { MessageSquarePlus } from "@lucide/vue";
import type * as MonacoApi from "monaco-editor";
import type { FileContent, FileSave, FileUnshown } from "~~/shared/types/files";

const { conversation, path, turn } = defineProps<{ conversation: string; path: string; turn?: number }>();

const UNSHOWN: Record<FileUnshown, string> = {
  "not-touched": "That file is outside this conversation's folder.",
  missing: "The file is no longer on disk.",
  "too-large": "The file is over 4 MB, too large to open here.",
  binary: "The file is binary, so there is nothing to edit.",
};

const UNSAVED: Record<Exclude<FileSave, { saved: true }>["reason"], string> = {
  ...UNSHOWN,
  "changed-on-disk": "The file changed on disk since you opened it. Discard to load it, then edit again.",
};

const chrome = useChrome();
const tray = useTray();
const host = useTemplateRef<HTMLElement>("host");
const content = ref<FileContent>();
const isDirty = ref(false);
const isStale = ref(false);
const isSaving = ref(false);

let editor: MonacoApi.editor.IStandaloneCodeEditor | undefined;
let api: typeof MonacoApi | undefined;
let hovered: MonacoApi.editor.IEditorDecorationsCollection | undefined;
let noted: MonacoApi.editor.IEditorDecorationsCollection | undefined;
let ticket = 0;

const file = computed(() => homePath(path));
const notes = computed(() => tray.items.value.filter((item) => item.file === file.value && !!item.path));

function spanOf(start: number, end: number): string {
  return start === end ? `line ${start}` : `lines ${start}-${end}`;
}

function linesOf(span: string): [number, number] | undefined {
  const [, start, end] = /(\d+)(?:-(\d+))?/.exec(span) ?? [];
  return start ? [Number(start), Number(end ?? start)] : undefined;
}

function markDirty(): void {
  const model = editor?.getModel();
  const opened = disk.get(path);
  isDirty.value = !!model && !!opened && model.getValue() !== opened.text;
  if (isDirty.value) unsaved.add(path);
  else unsaved.delete(path);
}

// A draft is kept over what the disk now says, and the save that follows is refused until it is reloaded.
function show(got: Extract<FileContent, { text: string }>): void {
  if (!editor || !api) return;
  const uri = api.Uri.file(got.path);
  const previous = editor.getModel();
  const held = api.editor.getModel(uri);
  const opened = disk.get(got.path);
  const isDraft = !!held && !!opened && held.getValue() !== opened.text;
  if (isDraft) isStale.value = opened.hash !== got.hash;
  else {
    disk.set(got.path, { hash: got.hash, text: got.text });
    isStale.value = false;
  }
  const model = held ?? api.editor.createModel(got.text, Monaco.languageOf(got.path), uri);
  if (!isDraft && model.getValue() !== got.text) model.setValue(got.text);
  editor.setModel(model);
  if (previous && previous !== model && !unsaved.has(previous.uri.fsPath)) previous.dispose();
  markDirty();
  paintNotes();
}

async function pull(): Promise<void> {
  const mine = ++ticket;
  const got = await $fetch<FileContent>(`/api/sessions/${encodeURIComponent(conversation)}/files/content`, {
    query: { path },
  }).catch((): FileContent => ({ path, reason: "missing" }));
  if (mine !== ticket) return;
  content.value = got;
  if ("text" in got) show(got);
}

async function save(): Promise<void> {
  const at = path;
  const model = editor?.getModel();
  const opened = disk.get(at);
  if (!model || !opened || isSaving.value || !isDirty.value) return;
  const text = model.getValue();
  isSaving.value = true;
  try {
    const reply = await $fetch<FileSave>(`/api/sessions/${encodeURIComponent(conversation)}/files/content`, {
      body: { base: opened.hash, path: at, text },
      method: "PUT",
    });
    if (reply.saved) {
      disk.set(at, { hash: reply.hash, text });
      if (at === path) {
        isStale.value = false;
        markDirty();
      }
      chrome.toast(`Saved ${basename(at)}`);
    } else {
      if (reply.reason === "changed-on-disk" && at === path) isStale.value = true;
      chrome.toast(UNSAVED[reply.reason], "destructive");
    }
  } catch {
    chrome.toast("The save never reached the sidecar", "destructive");
  } finally {
    isSaving.value = false;
  }
}

// Forgetting what was opened makes the next read a fresh open, so the disk text replaces the draft.
async function discard(): Promise<void> {
  disk.delete(path);
  unsaved.delete(path);
  await pull();
}

function linesToNote(line?: number): [number, number] {
  const selection = editor?.getSelection();
  const start = selection?.startLineNumber ?? 1;
  const end = selection?.endLineNumber ?? start;
  if (selection && !selection.isEmpty() && (!line || (line >= start && line <= end))) {
    // A selection that ends at the start of a line does not take that line.
    return [start, selection.endColumn === 1 && end > start ? end - 1 : end];
  }
  const at = line ?? selection?.positionLineNumber ?? 1;
  return [at, at];
}

function note(line?: number): void {
  const model = editor?.getModel();
  const box = host.value?.getBoundingClientRect();
  if (!editor || !model || !box) return;
  const [start, end] = linesToNote(line);
  const quote = model.getValueInRange({ endColumn: model.getLineMaxColumn(end), endLineNumber: end, startColumn: 1, startLineNumber: start });
  const at = editor.getScrolledVisiblePosition({ column: 1, lineNumber: end + 1 });
  const span = spanOf(start, end);
  chrome.comment.open({
    excerpt: quote,
    file: file.value,
    kind: "line",
    label: `${basename(path)}:${start === end ? start : `${start}-${end}`}`,
    path: span,
    quote,
    tell: `About ${span} of ${file.value}:`,
    x: Math.max(12, Math.min(box.left + (at?.left ?? 0), window.innerWidth - 432)),
    y: Math.max(12, Math.min(box.top + (at?.top ?? 0) + 6, window.innerHeight - 312)),
  });
}

function paintNotes(): void {
  if (!noted || !api) return;
  const Range = api.Range;
  noted.set(
    notes.value.flatMap((item) => {
      const lines = linesOf(item.path ?? "");
      if (!lines) return [];
      return [
        {
          options: {
            className: "files-noted",
            glyphMarginClassName: "files-noted-glyph",
            glyphMarginHoverMessage: { value: item.text },
            isWholeLine: true,
          },
          range: new Range(lines[0], 1, lines[1], 1),
        },
      ];
    }),
  );
}

function onUnload(event: BeforeUnloadEvent): void {
  if (unsaved.size) event.preventDefault();
}

onMounted(async () => {
  api = await Monaco.load();
  if (!host.value) return;
  const Range = api.Range;
  const Target = api.editor.MouseTargetType;
  editor = api.editor.create(host.value, {
    automaticLayout: true,
    fixedOverflowWidgets: true,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || undefined,
    fontSize: 12,
    glyphMargin: true,
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    theme: Monaco.themeOf(),
    wordWrap: "on",
  });
  hovered = editor.createDecorationsCollection();
  noted = editor.createDecorationsCollection();
  editor.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.KeyS, () => void save());
  editor.addAction({
    contextMenuGroupId: "navigation",
    contextMenuOrder: 0,
    id: "sidecar.note",
    label: "Note for Claude",
    run: () => note(),
  });
  editor.onDidChangeModelContent(markDirty);
  // A plus in the glyph margin follows the pointer, so a note is one click from any line.
  editor.onMouseMove((event) => {
    const line = event.target.position?.lineNumber;
    hovered?.set(line ? [{ options: { glyphMarginClassName: "files-note-add" }, range: new Range(line, 1, line, 1) }] : []);
  });
  editor.onMouseLeave(() => hovered?.clear());
  editor.onMouseDown((event) => {
    if (event.target.type !== Target.GUTTER_GLYPH_MARGIN) return;
    event.event.preventDefault();
    note(event.target.position?.lineNumber);
  });
  await pull();
});

// The sidecar's toggle flips `data-theme`, and Monaco keeps its own theme, so it follows by hand.
const themes = new MutationObserver(() => api?.editor.setTheme(Monaco.themeOf()));
onMounted(() => {
  themes.observe(document.documentElement, { attributeFilter: ["data-theme"], attributes: true });
  window.addEventListener("beforeunload", onUnload);
});

watch(
  () => [conversation, path] as const,
  () => {
    content.value = undefined;
    void pull();
  },
);

// A turn that touched the file reloads it, unless a draft is open over it.
watch(
  () => turn,
  () => void pull(),
);

watch(notes, paintNotes);

onBeforeUnmount(() => {
  themes.disconnect();
  window.removeEventListener("beforeunload", onUnload);
  const model = editor?.getModel();
  if (model && !unsaved.has(model.uri.fsPath)) model.dispose();
  editor?.dispose();
});
</script>

<template>
  <div class="editor" data-region="files-editor">
    <header class="bar">
      <span class="path">{{ file }}</span>
      <span v-if="isStale" class="state warn mono-meta" title="A turn changed this file while you were editing">
        changed on disk
      </span>
      <span v-else-if="isDirty" class="state mono-meta">unsaved</span>
      <UiIconButton :icon="MessageSquarePlus" label="Note the selected lines for Claude" size="xs" @click="note()" />
      <button v-if="isDirty || isStale" v-press class="ghost focusable" type="button" @click="discard">Discard</button>
      <button
        v-press
        class="save focusable"
        type="button"
        title="Save (⌘S)"
        :disabled="!isDirty || isSaving"
        @click="save"
      >
        {{ isSaving ? "Saving…" : "Save" }}
      </button>
    </header>
    <div class="body">
      <div v-show="content && 'text' in content" ref="host" class="host" data-region="files-viewer" />
      <p v-if="content && 'reason' in content" class="empty">{{ UNSHOWN[content.reason] }}</p>
      <p v-else-if="!content" class="empty">Reading the file…</p>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.bar {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 8px 12px;
}

.path {
  flex: 1;
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}

.state {
  color: var(--muted);
  flex: none;
  text-transform: none;
}

.state.warn {
  color: var(--warning);
}

.ghost,
.save {
  border-radius: 999px;
  cursor: pointer;
  flex: none;
  font-family: var(--sans);
  font-size: 11.5px;
  font-weight: 600;
  height: 26px;
  padding: 0 11px;
}

.ghost {
  background: var(--raised);
  border: 1px solid var(--border);
  color: var(--muted);
}

.ghost:hover {
  border-color: var(--ink);
  color: var(--ink);
}

.save {
  background: var(--ink);
  border: 0;
  color: var(--canvas);
}

.save:disabled {
  cursor: default;
  opacity: 0.4;
}

.body {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}

.host {
  height: 100%;
  min-height: 0;
  width: 100%;
}

.empty {
  color: var(--muted);
  display: grid;
  flex: 1;
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
  padding: 16px;
  place-items: center;
}
</style>

<style>
/* Monaco draws its gutter outside this component's scope, so these classes are global and prefixed. */
.files-note-add,
.files-noted-glyph {
  cursor: pointer;
}

.files-note-add::before {
  background: var(--primary);
  border-radius: 4px;
  color: var(--canvas);
  content: "+";
  display: grid;
  font: 700 12px/1 var(--sans);
  height: 16px;
  margin: 1px 0 0 2px;
  place-items: center;
  width: 16px;
}

.files-noted {
  background: color-mix(in oklch, var(--primary) 9%, transparent);
}

.files-noted-glyph::before {
  background: var(--primary);
  border-radius: 999px;
  content: "";
  display: block;
  height: 7px;
  margin: 6px 0 0 6px;
  width: 7px;
}
</style>
