<script lang="ts" setup>
import { ExternalLink, RotateCw, Trash2 } from "@lucide/vue";
import { useDebounceFn } from "@vueuse/core";
import type { FrameAnchor, FrameMark } from "~/types/frame";
import type { ArtifactDetail, ArtifactMeta, ReviewThread } from "~~/shared/types/artifact";

const { conversation, slug } = defineProps<{ conversation: string; slug: string }>();

const RELOADED = "The page reloaded with the change";

const sc = useSidecar();
const chrome = useChrome();
const route = useRoute();
const web = $web();
const follow = $follow();
const sides = $sideQuestion();
const tray = useTray();

const marks = ref<FrameMark[]>([]);
const anchors = ref<FrameAnchor[]>([]);
const noteCount = ref(0);
const fresh = ref<string[]>([]);
const answered = new Map<string, number>();
let shown = "";

const entry = computed(() => (sc.artifact.value?.slug === slug ? sc.artifact.value : undefined));
const address = computed(() => web.page?.url ?? entry.value?.url);
const page = computed(() => (address.value ? Web.pageOf(address.value) : "/"));
const host = computed(() => (address.value ? new URL(address.value).host : slug));
const threads = computed(() => Web.threadsOn(entry.value?.threads ?? [], page.value));
const notices = computed(() => Object.fromEntries(fresh.value.map((id) => [id, RELOADED])));
const isDown = computed(() => ["down", "moved", "unreachable"].includes(web.state));

const downLine = computed(() => {
  if (web.state === "moved")
    return `${host.value} keeps redirecting without ever showing a page, so it stopped here. Open it in a browser tab.`;
  if (web.state === "unreachable") return `The sidecar could not open ${host.value}. Reload to try again.`;
  return address.value && Web.isLocal(address.value)
    ? `Nothing answers on ${host.value}. Start the app, then reload.`
    : `Nothing answers on ${host.value} right now. Reload to try again.`;
});

// The rewrite changed the words the thread quotes, so the block is found by where the note was made, its key, first.
const changed = computed(() => {
  const open = threads.value.filter((thread) => fresh.value.includes(thread.id) && thread.status !== "resolved");
  const { pins } = anchorThreads({ anchors: anchors.value, marks: marks.value, threads: threads.value });
  const found = new Map<string, FrameMark>();
  for (const thread of open) {
    const key = tray.items.value.find((item) => item.thread === thread.id)?.mark;
    const pin = pins.find((one) => one.threads.some((held) => held.id === thread.id));
    const mark = marks.value.find((one) => (key ? one.key === key : one.top === pin?.top));
    if (mark) found.set(mark.key, mark);
  }
  return [...found.values()];
});

const awaiting = computed(() =>
  threads.value.some((thread) => thread.status !== "resolved" && thread.replies.at(-1)?.by !== "claude"),
);

const claudeSaid = (thread: ReviewThread): number => thread.replies.filter((reply) => reply.by === "claude").length;

async function refresh(reloaded: boolean): Promise<void> {
  const got = await $fetch<ArtifactDetail>(`/api/artifacts/${slug}`).catch(() => undefined);
  if (!got || sc.slug.value !== slug) return;
  sc.artifact.value = got;
  const next: string[] = [];
  for (const thread of got.threads) {
    if (reloaded && answered.has(thread.id) && claudeSaid(thread) > (answered.get(thread.id) ?? 0))
      next.push(thread.id);
    answered.set(thread.id, claudeSaid(thread));
  }
  if (next.length) fresh.value = [...new Set([...fresh.value, ...next])];
}

const recheck = useDebounceFn(() => void refresh(true), 1200);

// A thread left during this visit counts from here, or Claude's first answer to it would read as old news.
watch(
  () => entry.value?.threads ?? [],
  (all) => {
    for (const thread of all) if (!answered.has(thread.id)) answered.set(thread.id, claudeSaid(thread));
  },
);

watch(
  () => web.state,
  async (state) => {
    if (state !== "moved") return;
    try {
      const next = await web.follow(slug);
      if (next && next !== slug) follow.show({ key: conversation, slug: next });
    } catch {
      web.state = "unreachable";
    }
  },
);

function openOut(): void {
  if (web.movedTo) window.open(web.movedTo, "_blank", "noopener");
}

async function removeEntry(): Promise<void> {
  if (!entry.value) return;
  await web.remove(entry.value);
  if (route.params.slug) await navigateTo(`/c/${conversation}`);
}

function onMarks(next: FrameMark[]): void {
  marks.value = next;
  const text = next.map((mark) => mark.text).join("\n");
  if (shown && text !== shown && awaiting.value) void recheck();
  shown = text;
}

// The record keeps the last page and title, so the list and a reopen land where the person left off.
async function onPage(): Promise<void> {
  const at = web.page;
  if (!at) return;
  web.shown(slug);
  void refresh(true);
  await $fetch("/api/web", {
    body: { landed: true, session: conversation, title: at.title, url: at.url },
    method: "POST",
  }).catch(() => undefined);
  sc.catalogue.value = sc.catalogue.value.map((meta): ArtifactMeta =>
    meta.slug === slug ? { ...meta, title: at.title || meta.title, url: at.url } : meta,
  );
}

// Re-asserted after every pull, like the conversation key: the poll re-picks a slug whenever the held one is unknown.
watch(
  [() => conversation, () => slug, () => sc.sessions.value],
  () => {
    sc.sessionKey.value = conversation;
    sc.slug.value = slug;
  },
  { immediate: true },
);

watch(
  () => slug,
  (_, left) => {
    web.reset();
    marks.value = [];
    anchors.value = [];
    fresh.value = [];
    answered.clear();
    shown = "";
    chrome.comment.disarm();
    if (left) sides.leave(conversation, "artifact", left);
    void refresh(false);
  },
  { immediate: true },
);

onScopeDispose(() => {
  web.reset();
  chrome.comment.disarm();
  sides.leave(conversation, "artifact", slug);
});
</script>

<template>
  <div class="web-page" data-region="artifact-view">
    <div v-if="!entry" class="blank">
      <UiStateMessage v-if="!sc.ready.value" align="center" kind="loading">Reading the page…</UiStateMessage>
      <UiStateMessage v-else align="center" kind="error">
        <b>{{ slug }}</b> could not be read from the sidecar's web entries.
      </UiStateMessage>
    </div>

    <template v-else>
      <div v-if="isDown" class="down" role="status">
        <p class="why">{{ downLine }}</p>
        <div class="actions">
          <button
            v-if="web.state === 'moved'"
            v-press
            class="retry focusable"
            type="button"
            data-tip="Open in a browser tab"
            @click="openOut"
          >
            <UiIcon :icon="ExternalLink" size="xs" />
            Browser tab
          </button>
          <button
            v-else
            v-press
            class="retry focusable"
            type="button"
            data-tip="Reload · {cmd R}"
            @click="web.reload()"
          >
            <UiIcon :icon="RotateCw" size="xs" />
            Reload
          </button>
          <button
            v-press
            class="remove focusable"
            type="button"
            data-region="remove-entry"
            data-tip="Remove from Artifacts. The app isn't touched"
            @click="removeEntry"
          >
            <UiIcon :icon="Trash2" size="xs" />
            Remove entry
          </button>
        </div>
      </div>

      <div v-show="!isDown" class="live">
        <WebFrame
          :can-ask="marks.length > 0"
          :slug="slug"
          :url="entry.url ?? ''"
          @anchors="anchors = $event"
          @load="refresh(true)"
          @marks="onMarks"
          @page="onPage"
        />
        <span
          v-for="mark in changed"
          :key="mark.key"
          class="changed cela-spotlight"
          :style="{
            height: `${mark.height + 12}px`,
            left: `${mark.left - 6}px`,
            top: `${mark.top - 6}px`,
            width: `${mark.width + 12}px`,
          }"
        >
          <span class="tag mono-meta">Changed</span>
        </span>
      </div>

      <aside class="notes" data-region="gutter" :data-open="noteCount > 0">
        <header class="where mono-meta">
          <span class="page">{{ page }}</span>
          <span>{{ plural(noteCount, "thread") }}</span>
        </header>
        <ArtifactGutter
          class="perches"
          side="right"
          :anchors="anchors"
          :file="address && Web.addressOf(address)"
          :marks="marks"
          :notices="notices"
          :threads="threads"
          @notes="noteCount = $event"
          @reload="web.reload()"
        />
      </aside>
    </template>
  </div>
</template>

<style scoped>
.web-page {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.live {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

.changed {
  border: 2px solid var(--success);
  border-radius: 6px;
  box-shadow: 0 0 0 4px var(--success-soft);
  box-sizing: border-box;
  pointer-events: none;
  position: absolute;
}

.tag {
  background: var(--success-soft);
  border-radius: 999px;
  color: var(--success);
  padding: 3px 8px;
  position: absolute;
  right: 12px;
  top: -17px;
  white-space: nowrap;
}

.notes {
  background: var(--canvas);
  border-left: 1px solid var(--border);
  box-sizing: border-box;
  flex: none;
  overflow: hidden;
  position: relative;
  width: 312px;
}

.notes[data-open="false"] {
  display: none;
}

.where {
  align-items: center;
  color: var(--subtle);
  display: flex;
  gap: 8px;
  left: 16px;
  position: absolute;
  right: 16px;
  top: 14px;
}

.page {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.perches {
  inset: 0 16px;
  position: absolute;
}

.down,
.blank {
  align-items: center;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  justify-content: center;
  padding: 0 40px;
  text-align: center;
}

.why {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
  max-width: 360px;
  text-wrap: pretty;
}

.retry {
  align-items: center;
  background: var(--raised);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
}

.retry:hover {
  border-color: var(--ink);
}

.remove {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  transition:
    background var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.remove:hover {
  background: var(--error-soft);
  color: var(--error);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
</style>
