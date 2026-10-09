<script lang="ts" setup>
import type * as MonacoApi from "monaco-editor";

const { path, text } = defineProps<{ path: string; text: string }>();

const host = useTemplateRef<HTMLElement>("host");
let editor: MonacoApi.editor.IStandaloneCodeEditor | undefined;
let api: typeof MonacoApi | undefined;

function show(): void {
  if (!editor || !api) return;
  // The URI's extension picks the language, so no table of extensions is kept here.
  const uri = api.Uri.file(path);
  const previous = editor.getModel();
  const model = api.editor.getModel(uri) ?? api.editor.createModel(text, undefined, uri);
  if (model.getValue() !== text) model.setValue(text);
  editor.setModel(model);
  if (previous && previous !== model) previous.dispose();
}

onMounted(async () => {
  api = await Monaco.load();
  if (!host.value) return;
  editor = api.editor.create(host.value, {
    automaticLayout: true,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || undefined,
    fontSize: 12,
    minimap: { enabled: false },
    readOnly: true,
    renderLineHighlight: "none",
    scrollBeyondLastLine: false,
    theme: Monaco.themeOf(),
    wordWrap: "on",
  });
  show();
});

// The sidecar's toggle flips `data-theme`, and Monaco keeps its own theme, so it follows by hand.
const themes = new MutationObserver(() => api?.editor.setTheme(Monaco.themeOf()));
onMounted(() => themes.observe(document.documentElement, { attributeFilter: ["data-theme"], attributes: true }));

watch(() => [path, text], show);

onBeforeUnmount(() => {
  themes.disconnect();
  editor?.getModel()?.dispose();
  editor?.dispose();
});
</script>

<template>
  <div ref="host" class="viewer" data-region="files-viewer" />
</template>

<style scoped>
.viewer {
  height: 100%;
  min-height: 0;
  width: 100%;
}
</style>
