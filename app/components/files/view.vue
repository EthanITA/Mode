<script lang="ts" setup>
import { ExternalLink, FilePen, FilePlus2, FolderTree, PanelsTopLeft } from "@lucide/vue";
import { useLocalStorage } from "@vueuse/core";
import type { Component } from "vue";
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

    <UiSurface class="pane" data-region="files-preview" pad="none" variant="raised">
      <template v-if="selected && pageOf && sc.sessionKey.value">
        <header class="bar">
          <span class="path">{{ homePath(selected) }}</span>
          <NuxtLink
            class="open focusable"
            :to="`/c/${sc.sessionKey.value}/${pageOf}`"
            title="Open the page full width in the reader"
          >
            <UiIcon :icon="ExternalLink" size="sm" />
            Open page
          </NuxtLink>
        </header>
        <div class="read">
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

.open {
  align-items: center;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--ink);
  display: inline-flex;
  flex: none;
  font-size: 11.5px;
  font-weight: 600;
  gap: 6px;
  padding: 4px 11px;
  text-decoration: none;
}

.open:hover {
  border-color: var(--ink);
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
