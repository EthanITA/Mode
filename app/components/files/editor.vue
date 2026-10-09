<script lang="ts">
type Disk = { hash: string; text: string };

// Module-wide, so an unsaved draft outlives switching files and leaving the face.
const disk = new Map<string, Disk>();
const unsaved = new Set<string>();
</script>

<script lang="ts" setup>
import { MessageSquarePlus } from "@lucide/vue";
import type * as MonacoApi from "monaco-editor";
import { EditorNotes, type NoteAt, type Notes } from "~/utils/monaco/notes";
import { OneDarkVivid } from "~/utils/monaco/one-dark-vivid";
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
let pen: Notes | undefined;
let ticket = 0;

const file = computed(() => homePath(path));
const noted = computed(() => tray.items.value.filter((item) => item.file === file.value && !!item.path));

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

function openNote({ lines, quote, x, y }: NoteAt): void {
  const span = EditorNotes.spanOf(lines);
  chrome.comment.open({
    excerpt: quote,
    file: file.value,
    kind: "line",
    label: `${basename(path)}:${lines[0] === lines[1] ? lines[0] : lines.join("-")}`,
    path: span,
    quote,
    tell: `About ${span} of ${file.value}:`,
    x,
    y,
  });
}

// No file field, as Review's file note: the tell already names it, and a line note's file is what paints the gutter.
function noteFile(event: MouseEvent): void {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  chrome.comment.open({
    kind: "file",
    label: basename(path),
    tell: `About ${file.value}:`,
    x: Math.max(12, Math.min(box.right - 432, window.innerWidth - 432)),
    y: Math.min(box.bottom + 8, window.innerHeight - 312),
  });
}

function paintNotes(): void {
  pen?.paint(
    noted.value.flatMap((item) => {
      const lines = EditorNotes.parse(item.path ?? "");
      return lines ? [{ lines, text: item.text }] : [];
    }),
  );
}

function onUnload(event: BeforeUnloadEvent): void {
  if (unsaved.size) event.preventDefault();
}

onMounted(async () => {
  api = await Monaco.load();
  if (!host.value) return;
  editor = api.editor.create(host.value, {
    automaticLayout: true,
    fixedOverflowWidgets: true,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || undefined,
    fontSize: 12,
    glyphMargin: true,
    lineNumbersMinChars: 3,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    theme: OneDarkVivid.name,
    wordWrap: "on",
  });
  pen = EditorNotes.attach({ api, editor, onNote: openNote });
  editor.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.KeyS, () => void save());
  editor.onDidChangeModelContent(markDirty);
  await pull();
});

onMounted(() => window.addEventListener("beforeunload", onUnload));

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

watch(noted, paintNotes);

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onUnload);
  pen?.dispose();
  const model = editor?.getModel();
  if (model && !unsaved.has(model.uri.fsPath)) model.dispose();
  editor?.dispose();
});
</script>

<template>
  <div class="editor" data-region="files-editor" :style="OneDarkVivid.cssVars">
    <header class="bar">
      <span class="path">{{ file }}</span>
      <span v-if="isStale" class="state warn mono-meta" title="A turn changed this file while you were editing">
        changed on disk
      </span>
      <span v-else-if="isDirty" class="state mono-meta">unsaved</span>
      <ChromeAction
        :icon="MessageSquarePlus"
        label="Note"
        shape="pill"
        tip="Note the whole file · ⌘K notes the selected lines"
        @click="noteFile"
      />
      <button v-if="isDirty || isStale" v-press class="ghost focusable" type="button" @click="discard">Discard</button>
      <button
        v-press
        class="save focusable"
        type="button"
        data-tip="Save · ⌘S"
        :disabled="!isDirty || isSaving"
        @click="save"
      >
        {{ isSaving ? "Saving…" : "Save" }}
      </button>
    </header>
    <div class="body">
      <div v-show="content && 'text' in content" ref="host" class="host" data-region="files-viewer" />
      <UiStateMessage v-if="content && 'reason' in content" align="center" class="empty">
        {{ UNSHOWN[content.reason] }}
      </UiStateMessage>
      <UiStateMessage v-else-if="!content" align="center" class="empty" kind="loading">Reading the file…</UiStateMessage>
    </div>
  </div>
</template>

<style scoped>
.editor {
  background: var(--ed-bg);
  color: var(--ed-ink);
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

/* Stacked over the editor below, so a pill's tooltip is not painted under Monaco. */
.bar {
  --action-ink: var(--ed-ink);
  --action-line: var(--ed-button);
  align-items: center;
  background: var(--ed-bar);
  border-bottom: 1px solid var(--ed-border);
  display: flex;
  flex: none;
  gap: 8px;
  padding: 8px 12px;
  position: relative;
  z-index: 1;
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
  color: var(--ed-muted);
  flex: none;
  text-transform: none;
}

.state.warn {
  color: var(--ed-warn);
}

.ghost,
.save {
  align-items: center;
  border-radius: 999px;
  cursor: pointer;
  display: inline-flex;
  flex: none;
  font-family: var(--sans);
  font-size: 11.5px;
  font-weight: 600;
  gap: 5px;
  height: 26px;
  padding: 0 11px;
  transition:
    background-color var(--duration-press) ease,
    border-color var(--duration-press) ease,
    color var(--duration-press) ease;
}

.ghost {
  background: transparent;
  border: 1px solid var(--ed-button);
  color: var(--ed-muted);
}

@media (hover: hover) and (pointer: fine) {
  .ghost:hover {
    background: var(--ed-button);
    color: var(--ed-ink);
  }
}

.save {
  background: var(--ed-accent);
  border: 0;
  color: var(--ed-bg);
}

.save:disabled {
  background: var(--ed-button);
  color: var(--ed-muted);
  cursor: default;
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

/* The body is always One Dark, so the state line reads the editor's palette instead of the theme's. */
.empty {
  --ink: var(--ed-ink);
  --muted: var(--ed-muted);
  --subtle: var(--ed-muted);
  flex: 1;
  padding: 16px;
}
</style>
