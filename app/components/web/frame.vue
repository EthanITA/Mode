<script lang="ts" setup>
import { useEventListener } from "@vueuse/core";
import type { FrameAnchor, FrameHit, FrameMark, ViewBox } from "~/types/frame";
import { type AgentMessage, CHANNEL, type Envelope, type SidecarMessage, type WebHit } from "~~/lib/web/page/protocol";
import type { WebServeReply } from "~~/shared/types/web";

const { canAsk = false, slug, url } = defineProps<{ canAsk?: boolean; slug: string; url: string }>();

const emit = defineEmits<{
  anchors: [anchors: FrameAnchor[]];
  load: [];
  marks: [marks: FrameMark[]];
  page: [];
}>();

const chrome = useChrome();
const web = $web();
const frame = ref<HTMLIFrameElement>();
const proxy = ref<string>();
const upstream = ref<string>();
const src = ref<string>();
let started = 0;

async function start(): Promise<void> {
  const run = ++started;
  proxy.value = undefined;
  try {
    const got = await $fetch<WebServeReply>(`/api/web/${slug}/serve`, { method: "POST" });
    if (run !== started) return;
    proxy.value = Web.origin({ here: new URL(location.href), port: got.port, slug });
    upstream.value = got.upstream;
    src.value = Web.srcOf({ proxy: proxy.value, url: web.page?.url ?? url });
  } catch {
    if (run === started) web.state = "unreachable";
  }
}

function post(message: SidecarMessage): void {
  if (proxy.value)
    frame.value?.contentWindow?.postMessage(
      { ...message, channel: CHANNEL } satisfies Envelope<SidecarMessage>,
      proxy.value,
    );
}

// The page scrolls itself, so the frame's own box is all of it that can be on screen.
function clipOf(box: DOMRect): ViewBox {
  return {
    bottom: Math.min(box.bottom, window.innerHeight),
    left: box.left,
    right: box.right,
    top: Math.max(box.top, chrome.frame.insets.value.top),
  };
}

function hitOf(hit: WebHit): FrameHit | undefined {
  const box = frame.value?.getBoundingClientRect();
  if (!box) return undefined;
  return {
    ...hit,
    clip: clipOf(box),
    page: web.page && Web.addressOf(web.page.url),
    viewLeft: box.left + hit.left,
    viewTop: box.top + hit.top,
  };
}

// The down page says so while it parses, which lands before the agent is ready and before the load.
function greet(): void {
  if (web.state === "starting") web.state = "live";
  post({ type: "hello" });
  post({ type: "arm", armed: chrome.comment.armed.value });
}

function onLoad(): void {
  if (!proxy.value) return;
  greet();
  emit("load");
}

function onKey(key: string): void {
  if (key === "comment") {
    if (chrome.comment.armed.value) chrome.comment.disarm();
    else chrome.comment.arm();
  } else if (key === "escape") chrome.dismiss();
  else if (key === "hold") chrome.comment.arm(true);
  else if (key === "release") chrome.comment.release();
  else if (key === "reload") web.reload();
  else if (key === "remove") web.removeAimed();
  else if (key === "undo") web.undoRemove();
}

function onLayout(message: Extract<AgentMessage, { type: "layout" }>): void {
  emit("marks", message.marks);
  emit("anchors", message.anchors);
  const picked = message.picked && hitOf(message.picked);
  if (picked) chrome.comment.select(picked);
  if (chrome.comment.spot.value) return;
  const hot = message.hot && hitOf(message.hot);
  if (hot) chrome.comment.light(ringOf(hot));
  else if (!picked) chrome.comment.light(undefined);
}

useEventListener(window, "message", (event: MessageEvent<Partial<Envelope<AgentMessage>> | undefined>) => {
  if (!proxy.value || event.origin !== proxy.value || event.source !== frame.value?.contentWindow) return;
  if (event.data?.channel !== CHANNEL) return;
  const message = event.data as Envelope<AgentMessage>;
  switch (message.type) {
    case "away":
      window.open(message.url, "_blank", "noopener");
      return;
    case "down":
      web.state = "down";
      return;
    case "key":
      onKey(message.key);
      return;
    case "layout":
      onLayout(message);
      return;
    case "moved":
      web.movedTo = message.url;
      web.state = "moved";
      return;
    case "page": {
      const address = Web.upstreamOf(message.page.url, { proxy: proxy.value, upstream: upstream.value ?? "" });
      if (new URL(address).origin !== upstream.value) return;
      web.page = { title: message.page.title, url: address };
      emit("page");
      return;
    }
    case "pick": {
      if (chrome.comment.spot.value) return;
      const hit = hitOf(message.hit);
      if (hit) chrome.comment.compose(hit, canAsk);
      return;
    }
    case "ready":
      greet();
  }
});

// With the sidecar focused, ⌘R would reload the sidecar itself rather than the page in it.
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r" && !event.shiftKey) {
    event.preventDefault();
    web.reload();
  }
});

watch(chrome.comment.armed, (armed) => post({ type: "arm", armed }));
watch(chrome.comment.pick, (hit) => {
  if (!hit) post({ type: "clear" });
});
watch(
  () => web.going,
  (path) => {
    if (!path) return;
    web.going = undefined;
    post({ type: "go", path });
  },
);
watch(
  () => web.edition,
  () => void start(),
);
watch(
  () => slug,
  () => void start(),
  { immediate: true },
);
</script>

<template>
  <div class="web" data-region="web-frame">
    <iframe
      v-if="src && proxy"
      ref="frame"
      :key="`${slug}:${web.edition}`"
      allow="clipboard-read; clipboard-write; fullscreen"
      :data-state="web.state"
      :src="src"
      :title="`Live page ${slug}`"
      @load="onLoad"
    />
    <UiStateMessage v-if="web.state === 'starting'" align="center" class="pending" kind="loading">
      Opening the page…
    </UiStateMessage>
  </div>
</template>

<style scoped>
.web {
  background: var(--raised);
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  position: relative;
}

iframe {
  border: 0;
  display: block;
  height: 100%;
  transition: opacity var(--duration-fast) var(--ease-out);
  width: 100%;
}

/* Held back until the agent is up, so a half-parsed page never shows under the loading line. */
iframe[data-state="starting"] {
  opacity: 0;
}

.pending {
  inset: 0;
  position: absolute;
}
</style>
