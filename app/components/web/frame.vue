<script lang="ts" setup>
import { useEventListener } from "@vueuse/core";
import type { FrameAnchor, FrameHit, FrameMark, ViewBox } from "~/types/frame";
import type { ProxyPlace } from "~~/lib/web/host";
import { isTyping } from "~~/lib/web/page/blocks";
import { isAddressKey, stepOf } from "~~/lib/web/page/keys";
import { type AgentMessage, CHANNEL, type Envelope, type SidecarMessage, type WebHit } from "~~/lib/web/page/protocol";
import type { WebArrival, WebServeReply } from "~~/shared/types/web";

const {
  canAsk = false,
  inset = 0,
  slug,
  url,
} = defineProps<{
  canAsk?: boolean;
  /** Room the notes hold at the inline end, taken by narrowing the frame since padding a live site's root breaks fixed layouts. */
  inset?: number;
  slug: string;
  url: string;
}>();

const emit = defineEmits<{
  anchors: [anchors: FrameAnchor[]];
  load: [];
  marks: [marks: FrameMark[]];
  page: [how: WebArrival];
}>();

// Everything but leaving: a site can never navigate the sidecar window itself, whatever its links or scripts ask.
const SANDBOX = [
  "allow-downloads",
  "allow-forms",
  "allow-modals",
  "allow-orientation-lock",
  "allow-pointer-lock",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
  "allow-same-origin",
  "allow-scripts",
  "allow-storage-access-by-user-activation",
  "allow-top-navigation-to-custom-protocols",
].join(" ");

const chrome = useChrome();
const web = $web();
const artifact = $artifact();
const shown = useFaceShown();
const look = useTheme();
const frame = ref<HTMLIFrameElement>();
const place = ref<ProxyPlace>();
// The frame moves between the artifact's hosts as it goes from site to site, and a message only reaches the one it is on.
const on = ref<string>();
const src = ref<string>();
let started = 0;

async function start(): Promise<void> {
  const run = ++started;
  place.value = undefined;
  try {
    const got = await $fetch<WebServeReply>(`/api/web/${slug}/serve`, { method: "POST" });
    if (run !== started) return;
    const next = Web.placeOf({ here: new URL(location.href), port: got.port });
    const to = Web.proxied(web.page?.url ?? url, next);
    if (!to) throw new Error(`${url} has no address inside the artifact`);
    place.value = next;
    src.value = to;
    on.value = new URL(to).origin;
  } catch {
    if (run === started) {
      web.state = "unreachable";
      web.isBusy = false;
    }
  }
}

function isOurs(origin: string): boolean {
  const at = place.value;
  return !!at && URL.canParse(origin) && new URL(origin).port === String(at.port) && !!Web.upstream(origin, at.base);
}

function post(message: SidecarMessage): void {
  if (on.value)
    frame.value?.contentWindow?.postMessage(
      { ...message, channel: CHANNEL } satisfies Envelope<SidecarMessage>,
      on.value,
    );
}

// The page scrolls itself, so the frame's own box is all of it that can be on screen; grown, nothing floats over it.
function clipOf(box: DOMRect): ViewBox {
  return {
    bottom: Math.min(box.bottom, window.innerHeight),
    left: box.left,
    right: box.right,
    top: artifact.isFull ? box.top : Math.max(box.top, chrome.frame.insets.value.top),
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
  post({ type: "theme", theme: look.theme.value });
}

function onLoad(): void {
  if (!place.value) return;
  web.isBusy = false;
  greet();
  emit("load");
}

function onKey(key: string): void {
  if (key === "comment") {
    if (chrome.comment.armed.value) chrome.comment.disarm();
    else chrome.comment.arm();
  } else if (key === "escape" && !chrome.dismiss()) artifact.isFull = false;
  else if (key === "hold") chrome.comment.arm(true);
  else if (key === "release") chrome.comment.release();
  else if (key === "reload") web.reload();
  else if (key === "remove") web.removeAimed();
  else if (key === "undo") web.undoRemove();
  else if (key === "full") artifact.toggleFull();
  else if (key === "back") web.step(-1);
  else if (key === "forward") web.step(1);
  else if (key === "address") web.askAddress();
}

function onLayout(message: Extract<AgentMessage, { type: "layout" }>): void {
  emit("marks", message.marks);
  emit("anchors", message.anchors);
  // A layout sent before the site heard the clear still carries the old pick, so it only moves a pick still held.
  const picked = chrome.comment.pick.value && message.picked && hitOf(message.picked);
  if (picked) chrome.comment.select(picked);
  if (chrome.comment.spot.value) return;
  const hot = message.hot && hitOf(message.hot);
  if (hot) chrome.comment.light(ringOf(hot));
  else if (!picked) chrome.comment.light(undefined);
}

useEventListener(window, "message", (event: MessageEvent<Partial<Envelope<AgentMessage>> | undefined>) => {
  if (!isOurs(event.origin) || event.source !== frame.value?.contentWindow) return;
  if (event.data?.channel !== CHANNEL) return;
  on.value = event.origin;
  const message = event.data as Envelope<AgentMessage>;
  switch (message.type) {
    case "busy":
      web.isBusy = message.busy;
      return;
    case "down":
      web.state = "down";
      web.isBusy = false;
      return;
    case "key":
      onKey(message.key);
      return;
    case "layout":
      onLayout(message);
      return;
    case "page": {
      const address = place.value && Web.upstream(message.page.url, place.value.base);
      if (!address) return;
      web.page = { icon: message.page.icon, title: message.page.title, url: address.href };
      emit("page", message.how);
      return;
    }
    case "pick": {
      if (chrome.comment.spot.value) return;
      const hit = hitOf(message.hit);
      if (hit) chrome.comment.compose(hit, { canAsk, slug });
      return;
    }
    case "ready":
      greet();
  }
});

// With the sidecar focused, ⌘R, ⌘[ and ⌘L would act on the sidecar itself rather than the page in it.
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (!shown.value || !(event.metaKey || event.ctrlKey)) return;
  const by = isTyping(event.target) ? undefined : stepOf(event);
  if (event.key.toLowerCase() === "r" && !event.shiftKey) web.reload();
  else if (by) web.step(by);
  else if (isAddressKey(event)) web.askAddress();
  else return;
  event.preventDefault();
});

watch(chrome.comment.armed, (armed) => post({ type: "arm", armed }));
watch(look.theme, (theme) => post({ type: "theme", theme }));
watch(chrome.comment.pick, (hit) => {
  if (!hit) post({ type: "clear" });
});
watch(
  () => web.stepping,
  (asked) => {
    const to = asked && place.value && Web.proxied(asked.to, place.value);
    if (!asked || !to) return;
    web.stepping = undefined;
    post({ type: "step", by: asked.by, to });
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
  <div class="web" data-region="web-frame" :style="{ paddingInlineEnd: inset ? `${inset}px` : undefined }">
    <span class="progress" aria-hidden="true" data-region="web-progress" :data-busy="web.isBusy" />
    <iframe
      v-if="src && place"
      ref="frame"
      :key="`${slug}:${web.edition}`"
      allow="clipboard-read; clipboard-write; fullscreen"
      :data-state="web.state"
      :sandbox="SANDBOX"
      :src="src"
      :style="{ colorScheme: look.theme.value }"
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

/* Done, it runs to the end before it fades, so a quick page still reads as finished rather than cut off. */
.progress {
  background: var(--primary);
  height: 2px;
  inset: 0 0 auto;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  transform-origin: left;
  transition:
    transform var(--duration-fast) var(--ease-out),
    opacity var(--duration-base) var(--ease-out) var(--duration-fast);
  z-index: 1;
}

.progress[data-busy="true"] {
  animation: creep 12s cubic-bezier(0.1, 0.65, 0.2, 1) forwards;
  opacity: 1;
  transition: none;
}

@keyframes creep {
  from {
    transform: scaleX(0.04);
  }

  to {
    transform: scaleX(0.92);
  }
}

@media (prefers-reduced-motion: reduce) {
  .progress[data-busy="true"] {
    animation: none;
    opacity: 0.6;
  }
}
</style>
