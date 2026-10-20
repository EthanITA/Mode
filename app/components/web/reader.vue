<script lang="ts" setup>
import { RotateCw, Trash2 } from "@lucide/vue";
import { useDebounceFn } from "@vueuse/core";
import type { FrameAnchor, FrameMark } from "~/types/frame";
import type { WebArrival } from "~~/shared/types/web";
import type { ArtifactDetail, ArtifactMeta, ReviewThread } from "~~/shared/types/artifact";

const { conversation, slug } = defineProps<{ conversation: string; slug: string }>();

const RELOADED = "The page reloaded with the change";

const sc = useSidecar();
const chrome = useChrome();
const route = useRoute();
const web = $web();
const sides = $sideQuestion();
const tray = useTray();

const marks = ref<FrameMark[]>([]);
const anchors = ref<FrameAnchor[]>([]);
const measured = ref(false);
const fresh = ref<string[]>([]);
const answered = new Map<string, number>();
const isShown = useFaceShown();
let shown = "";

// Files can point the shared artifact elsewhere while this face waits behind it, and losing the entry would drop the frame.
const held = ref<ArtifactDetail>();
watch(
  () => sc.artifact.value,
  (got) => {
    if (got?.slug === slug) held.value = got;
  },
  { immediate: true },
);
const entry = computed(() => (held.value?.slug === slug ? held.value : undefined));
// Seeded as soon as the entry reads, so the arrows know the way back before the page has loaded.
watch(entry, (got) => web.seed(got?.trail));
const address = computed(() => web.page?.url ?? entry.value?.url);
// Threads are keyed by the whole address, since one artifact can go from site to site.
const page = computed(() => (address.value ? Web.addressOf(address.value) : ""));
const where = computed(() => (address.value ? Web.shortOf(address.value, {}) : "/"));
const host = computed(() => (address.value ? new URL(address.value).host : slug));
const threads = computed(() => Web.threadsOn(entry.value?.threads ?? [], page.value));
const notices = computed(() => Object.fromEntries(fresh.value.map((id) => [id, RELOADED])));
const isDown = computed(() => ["down", "unreachable"].includes(web.state));

const downLine = computed(() => {
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

async function removeEntry(): Promise<void> {
  if (!entry.value) return;
  await web.remove(entry.value);
  if (route.params.slug) await navigateTo(`/c/${conversation}`);
}

function onMarks(next: FrameMark[]): void {
  marks.value = next;
  measured.value = true;
  const text = next.map((mark) => mark.text).join("\n");
  if (shown && text !== shown && awaiting.value) void recheck();
  shown = text;
}

// The record keeps the last page, its title and the way back to it, so the list and a reopen land where the person left off.
async function onPage(how: WebArrival): Promise<void> {
  const at = web.page;
  if (!at) return;
  web.seed(entry.value?.trail);
  web.arrive({ how, url: at.url });
  void refresh(true);
  await $fetch(`/api/web/${slug}`, {
    body: { title: at.title, trail: web.trail, url: at.url },
    method: "PATCH",
  }).catch(() => undefined);
  sc.catalogue.value = sc.catalogue.value.map((meta): ArtifactMeta =>
    meta.slug === slug ? { ...meta, title: at.title || meta.title, url: at.url } : meta,
  );
}

// Re-asserted after every pull, like the conversation key: the poll re-picks a slug whenever the held one is unknown.
watch(
  [() => conversation, () => slug, () => sc.sessions.value, isShown],
  () => {
    if (!isShown.value) return;
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
    measured.value = false;
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
          <UiButton data-tip="Reload · {cmd R}" :icon="RotateCw" size="xs" variant="outline" @click="web.reload()">
            Reload
          </UiButton>
          <UiButton
            data-region="remove-entry"
            data-tip="Remove from Artifacts. The app isn't touched"
            :icon="Trash2"
            size="xs"
            tone="destructive"
            variant="ghost"
            @click="removeEntry"
          >
            Remove entry
          </UiButton>
        </div>
      </div>

      <CommentLayer
        v-show="!isDown"
        v-slot="{ canAsk, inset }"
        :anchors="anchors"
        :file="address && Web.addressOf(address)"
        :marks="marks"
        :notices="notices"
        :page="where"
        :ready="measured"
        scrolls
        :slug="slug"
        :threads="threads"
        @reload="web.reload()"
      >
        <div class="live">
          <WebFrame
            :can-ask="canAsk"
            :inset="inset"
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
            <UiBadge class="tag" size="xs" tone="success">Changed</UiBadge>
          </span>
        </div>
      </CommentLayer>
    </template>
  </div>
</template>

<style scoped>
.web-page {
  @apply flex min-h-0 min-w-0 flex-1;
}

.live {
  @apply relative flex min-w-0 flex-1 overflow-hidden;
}

.changed {
  @apply pointer-events-none absolute rounded-md border-2 border-success ring-4 ring-success-soft;
}

.tag {
  @apply absolute -top-4.25 right-3;
}

.down,
.blank {
  @apply flex flex-1 flex-col items-center justify-center gap-3.5 px-10 py-0 text-center;
}

.why {
  @apply m-0 max-w-90 typo-body text-pretty text-muted;
}

.actions {
  @apply flex flex-wrap justify-center gap-2;
}
</style>
