<script lang="ts" setup>
import type { FileAction, FileGroup, SessionFile } from "~~/shared/types/files";

const sc = useSidecar();
const files = useFiles(() => sc.sessionKey.value);

const GROUPS: { group: FileGroup; title: string; blurb: string }[] = [
  { group: "produced", title: "Produced", blurb: "created in this conversation" },
  { group: "interacted", title: "Interacted", blurb: "read or changed in this conversation" },
];

const VERB: Record<FileAction, string> = { read: "read", edit: "edited", delete: "deleted" };

const rows = computed(() => files.value?.files ?? []);
// The dot marks whatever the most recent turn that touched a file read or edited.
const latest = computed(() => rows.value.reduce((at, one) => Math.max(at, one.lastTurn), 0));

const pages = computed(() => new Map(sc.catalogue.value.map((meta) => [meta.path, meta.slug])));
const owned = computed(() => new Set(sc.sessions.value.find((s) => s.key === sc.sessionKey.value)?.artifacts ?? []));

function slugOf(file: SessionFile): string | undefined {
  const slug = pages.value.get(file.path);
  return slug && owned.value.has(slug) ? slug : undefined;
}

function folderOf(path: string): string {
  return homePath(path.slice(0, path.lastIndexOf("/")));
}

const groups = computed(() =>
  GROUPS.map((one) => ({ ...one, files: rows.value.filter((file) => file.group === one.group) })).filter(
    (one) => one.files.length,
  ),
);
</script>

<template>
  <section class="files" data-region="files">
    <UiSurface class="pane" data-region="files-table" pad="none" variant="raised">
      <div class="scroll">
        <p v-if="!sc.sessionKey.value" class="empty">No conversation is selected.</p>
        <p v-else-if="!files" class="empty">Reading what this conversation touched…</p>
        <p v-else-if="!rows.length" class="empty">This conversation hasn't read or written any file yet.</p>

        <table v-for="one in groups" :key="one.group" class="table" :data-group="one.group">
          <caption>
            <span class="title">{{ one.title }}</span>
            <span class="blurb mono-meta">{{ plural(one.files.length, "file") }}, {{ one.blurb }}</span>
          </caption>
          <thead>
            <tr>
              <th class="dot-col"><span class="sr">Last touched</span></th>
              <th>File</th>
              <th>Folder</th>
              <th class="num">Reads</th>
              <th class="num">Edits</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="file in one.files"
              :key="file.path"
              data-cmt="file"
              :data-cmt-label="basename(file.path)"
              :data-cmt-tell="`About ${homePath(file.path)}:`"
              :data-cmt-excerpt="homePath(file.path)"
            >
              <td class="dot-col">
                <span
                  v-if="file.lastTurn === latest"
                  class="dot"
                  :data-action="file.lastAction"
                  :title="`Last ${VERB[file.lastAction]}, turn ${file.lastTurn}`"
                />
              </td>
              <td class="name">
                <NuxtLink v-if="slugOf(file)" class="link focusable" :to="`/c/${sc.sessionKey.value}/${slugOf(file)}`">
                  {{ basename(file.path) }}
                </NuxtLink>
                <span v-else>{{ basename(file.path) }}</span>
                <span v-if="file.lastAction === 'delete'" class="gone mono-meta">deleted</span>
              </td>
              <td class="folder mono-meta">{{ folderOf(file.path) }}</td>
              <td class="num mono-meta">{{ file.reads || "" }}</td>
              <td class="num mono-meta">{{ file.edits || "" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiSurface>
  </section>
</template>

<style scoped>
.files {
  height: 100%;
  min-height: 0;
}

.pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.scroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 20px;
}

.scroll > * {
  flex-shrink: 0;
}

.table {
  border-collapse: collapse;
  font-size: 12.5px;
  width: 100%;
}

caption {
  align-items: baseline;
  display: flex;
  gap: 10px;
  padding: 0 0 8px;
  text-align: left;
}

.title {
  font-size: 13px;
  font-weight: 800;
}

.blurb {
  color: var(--muted);
  text-transform: none;
}

th {
  border-bottom: 1px solid var(--border-strong);
  color: var(--subtle);
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  padding: 6px 10px 6px 0;
  text-align: left;
  text-transform: uppercase;
}

td {
  border-bottom: 1px solid var(--border);
  padding: 7px 10px 7px 0;
  vertical-align: baseline;
}

tbody tr:hover td {
  background: var(--sunken);
}

.dot-col {
  padding-left: 4px;
  width: 18px;
}

.dot {
  border-radius: 999px;
  display: inline-block;
  height: 7px;
  width: 7px;
}

.dot[data-action="read"] {
  background: var(--info);
}

.dot[data-action="edit"] {
  background: var(--primary);
}

.dot[data-action="delete"] {
  background: var(--error);
}

.name {
  font-family: var(--mono);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.link {
  color: var(--primary-deep);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.gone {
  background: var(--error-soft);
  border-radius: 999px;
  color: var(--error);
  margin-left: 6px;
  padding: 0 6px;
  text-transform: none;
}

.folder {
  color: var(--muted);
  overflow-wrap: anywhere;
  text-transform: none;
}

.num {
  text-align: right;
  width: 56px;
}

.sr {
  clip: rect(0 0 0 0);
  height: 1px;
  overflow: hidden;
  position: absolute;
  width: 1px;
}

.empty {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}
</style>
