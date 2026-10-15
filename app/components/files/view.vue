<script lang="ts" setup>
import { FilePen, FilePlus2, FolderTree } from "@lucide/vue";
import type { Component } from "vue";
import type { FileGroup, SessionFile } from "~~/shared/types/files";
import type { TreeEntry } from "~~/shared/types/tree";

type Scope = "all" | FileGroup;

const { initial: sideInitial, width: side } = usePaneWidth();

const sc = useSidecar();
const artifact = $artifact();
const files = useFiles(() => sc.sessionKey.value);
const selected = useConversationPick("fl:picks");
const scope = useState<Scope>("fl:scope", () => "produced");
const showIgnored = useState("fl:ignored", () => false);

const SCOPES = [
  { hint: "The whole folder", icon: FolderTree, label: "All", value: "all" },
  { hint: "Files Claude created", icon: FilePlus2, label: "Produced", value: "produced" },
  { hint: "Files Claude read or changed", icon: FilePen, label: "Interacted", value: "interacted" },
] satisfies { hint: string; icon: Component; label: string; value: Scope }[];

const EMPTY: Record<Exclude<Scope, "all">, string> = {
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

const scoped = usePathsTree(() =>
  (files.value?.files ?? []).filter((file) => file.group === scope.value).map((file) => file.path),
);
const source = computed(() => (scope.value === "all" ? folder : scoped));
const pageOf = computed(() => (selected.value ? pages.value.get(selected.value) : undefined));

// A new turn can create or delete files, so the folders already open are listed again.
watch(latest, () => folder.refresh());

function markOf(entry: TreeEntry): SessionFile | undefined {
  return entry.kind === "file" ? touched.value.get(entry.path) : undefined;
}
</script>

<template>
  <section class="files" data-region="files" :style="{ '--side-w': `${side}px` }">
    <UiSurface
      class="pane"
      data-region="files-table"
      :data-listed="artifact.isFull && artifact.isListed"
      pad="none"
      variant="raised"
    >
      <header class="bar scopes">
        <UiSegmented v-model="scope" :options="SCOPES" />
      </header>
      <div v-if="session && scope === 'all'" class="root">
        <span class="where mono-meta" :title="session.cwd">{{ homePath(session.cwd) }}</span>
        <UiChip :selected="showIgnored" size="xs" @click="showIgnored = !showIgnored">Ignored</UiChip>
      </div>
      <div class="scroll">
        <UiStateMessage v-if="!sc.sessionKey.value" class="empty">No conversation is selected.</UiStateMessage>
        <UiStateMessage v-else-if="scope !== 'all' && !scoped.root.value" class="empty">{{
          EMPTY[scope]
        }}</UiStateMessage>
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

    <PaneResizer v-model="side" :initial="sideInitial" label="Resize the file tree" />

    <ArtifactSheet :conversation="sc.sessionKey.value" :path="selected" :slug="pageOf">
      <FilesEditor
        v-if="selected && sc.sessionKey.value"
        :conversation="sc.sessionKey.value"
        :path="selected"
        :turn="touched.get(selected)?.lastTurn"
      />
      <UiStateMessage v-else align="center" class="centered">Pick a file to open it here.</UiStateMessage>
    </ArtifactSheet>
  </section>
</template>

<style scoped>
/* The middle track is the resizer's; half the face caps a width remembered from a wider window. */
.files {
  @apply grid h-full min-h-0 grid-cols-pane gap-x-2;
}

.pane {
  @apply flex min-h-0 flex-col overflow-hidden;
}

/* Over the grown sheet's left edge, under its islands, so another file opens without leaving fullscreen. */
.pane[data-listed="true"] {
  @apply fixed top-14 bottom-2 left-2 z-28 w-80;
}

.bar {
  @apply flex flex-none items-center gap-2 border-b border-b-border px-3 py-2;
}

/* The scopes fill the row while their labels fit, and fall back to icons with the label as a tooltip below that. */
.scopes {
  @apply @container;
}

.scopes :deep(.segmented) {
  @apply flex w-full;
}

.scopes :deep(.segmented-option) {
  @apply flex-auto justify-center px-2.5;
}

.scopes :deep(.segmented-option svg) {
  @apply hidden;
}

@container (width < 280px) {
  .scopes :deep(.segmented-option) {
    @apply gap-0 typo-mono-pico font-sans;
  }

  .scopes :deep(.segmented-option svg) {
    @apply block;
  }
}

.root {
  @apply flex flex-none items-center gap-2 border-b border-b-border py-1.25 pr-2 pl-3.5;
}

.where {
  @apply min-w-0 flex-1 truncate text-subtle normal-case;
}

.scroll {
  @apply min-h-0 flex-1 overflow-y-auto px-1.5 pt-1.5 pb-(--float-clear);
}

.dot {
  @apply size-1.75 flex-none rounded-full border-2 border-current;
}

.dot[data-group="produced"] {
  @apply text-success;
}

.dot[data-group="interacted"] {
  @apply text-info;
}

.dot[data-latest="true"] {
  @apply bg-current;
}

.empty {
  @apply p-2;
}

.centered {
  @apply flex-1 p-4;
}
</style>
