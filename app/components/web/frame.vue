<script lang="ts" setup>
import { useEventListener } from "@vueuse/core";
import type { FrameAnchor, FrameHit, FrameMark, ViewBox } from "~/types/frame";
import type { ProxyPlace } from "~~/lib/web/host";
import { isTyping } from "~~/lib/web/page/blocks";
import { isAddressKey, stepOf } from "~~/lib/web/page/keys";
import type { CommentOffer } from "~/composables/useChrome";
import {
  type AgentMessage,
  CHANNEL,
  type Envelope,
  type SidecarMessage,
  type WebHit,
  type WebSelection,
} from "~~/lib/web/page/protocol";
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

interface SidecarShell {
  openInChrome(url: string): void;
  partition: string;
  present: true;
}
interface WebviewTag extends HTMLElement {
  send(channel: string, ...args: unknown[]): void;
}

const chrome = useChrome();
const web = $web();
const artifact = $artifact();
const shown = useFaceShown();
const look = useTheme();
const shellApi = (window as unknown as { sidecarShell?: SidecarShell }).sidecarShell;
// The desktop shell renders the artifact as a real top-level page in a webview; without it the proxy frame is the light option.
const shell = !!shellApi;
const IPC = "sidecar";
const frame = ref<HTMLIFrameElement>();
const view = ref<WebviewTag>();
const place = ref<ProxyPlace>();
// The frame moves between the artifact's hosts as it goes from site to site, and a message only reaches the one it is on.
const on = ref<string>();
const src = ref<string>();
let started = 0;

const rect = (): DOMRect | undefined => (frame.value ?? view.value)?.getBoundingClientRect();

async function start(): Promise<void> {
  const run = ++started;
  if (shell) {
    src.value = web.page?.url ?? url;
    return;
  }
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
  const envelope = { ...message, channel: CHANNEL } satisfies Envelope<SidecarMessage>;
  if (shell) view.value?.send(IPC, envelope);
  else if (on.value) frame.value?.contentWindow?.postMessage(envelope, on.value);
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
  const box = rect();
  if (!box) return undefined;
  return {
    ...hit,
    clip: clipOf(box),
    page: web.page && Web.addressOf(web.page.url),
    viewLeft: box.left + hit.left,
    viewTop: box.top + hit.top,
  };
}

let offered: CommentOffer | undefined;

function onSelect(selection?: WebSelection): void {
  const box = rect();
  const hit = selection && hitOf(selection.hit);
  const clip = box && clipOf(box);
  const end = selection &&
    box && {
      bottom: selection.end.bottom + box.top,
      left: selection.end.left + box.left,
      right: selection.end.right + box.left,
      top: selection.end.top + box.top,
    };
  chrome.comment.withdraw(offered);
  offered = undefined;
  if (!selection || !hit || !end || !clip || end.bottom < clip.top || end.top > clip.bottom) return;
  offered = { end, spot: spotOf({ hit, owner: { canAsk, slug }, quote: selection.quote }) };
  chrome.comment.offer(offered);
}

// The down page says so while it parses, which lands before the agent is ready and before the load.
function greet(): void {
  if (web.state === "starting") web.state = "live";
  post({ type: "hello" });
  post({ type: "arm", armed: chrome.comment.armed.value });
  post({ type: "theme", theme: look.theme.value });
  post({ type: "wide", wide: chrome.comment.wide.value });
}

function onLoad(): void {
  if (!place.value) return;
  web.isBusy = false;
  greet();
  emit("load");
}

function onReady(): void {
  if (web.state === "starting") web.state = "live";
}

function onStop(): void {
  web.isBusy = false;
  emit("load");
}

// -3 is an aborted load, which a site's own redirect or a cancelled subresource raises and the page recovers from.
function onFail(event: { errorCode: number; isMainFrame: boolean }): void {
  if (!event.isMainFrame || event.errorCode === -3) return;
  web.state = "down";
  web.isBusy = false;
}

function onKey(key: string): void {
  if (key === "comment") {
    if (chrome.comment.openOffer()) return;
    if (chrome.comment.armed.value) chrome.comment.disarm();
    else chrome.comment.arm();
  } else if (key === "escape" && !chrome.dismiss()) artifact.isFull = false;
  else if (key === "hold") chrome.comment.arm(true);
  else if (key === "wide" || key === "narrow") chrome.comment.widen(key === "wide");
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

function realUrl(raw: string): string | undefined {
  if (shell) return raw;
  return (place.value && Web.upstream(raw, place.value.base))?.href;
}

function receive(message: Envelope<AgentMessage>): void {
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
      const address = realUrl(message.page.url);
      if (!address) return;
      web.page = { icon: message.page.icon, title: message.page.title, url: address };
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
      return;
    case "select":
      onSelect(message.selection);
  }
}

// The webview carries the agent's messages over its host channel, since a real page cannot postMessage the sidecar window.
function onIpc(event: { args: unknown[]; channel: string }): void {
  if (event.channel !== IPC) return;
  const message = event.args[0] as Envelope<AgentMessage>;
  if (message?.channel === CHANNEL) receive(message);
}

useEventListener(window, "message", (event: MessageEvent<Partial<Envelope<AgentMessage>> | undefined>) => {
  if (shell || !isOurs(event.origin) || event.source !== frame.value?.contentWindow) return;
  if (event.data?.channel !== CHANNEL) return;
  on.value = event.origin;
  receive(event.data as Envelope<AgentMessage>);
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
watch(chrome.comment.wide, (wide) => post({ type: "wide", wide }));
watch(chrome.comment.pick, (hit) => {
  if (!hit) post({ type: "clear" });
});
watch(
  () => web.stepping,
  (asked) => {
    if (!asked) return;
    const to = shell ? asked.to : place.value && Web.proxied(asked.to, place.value);
    if (!to) return;
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
      v-if="!shell && src && place"
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
    <webview
      v-if="shell && src"
      ref="view"
      allowpopups
      :key="`${slug}:${web.edition}`"
      :data-state="web.state"
      :partition="shellApi?.partition"
      :src="src"
      :style="{ colorScheme: look.theme.value }"
      :title="`Live page ${slug}`"
      @did-fail-load="onFail"
      @did-start-loading="web.isBusy = true"
      @did-stop-loading="onStop"
      @dom-ready="onReady"
      @ipc-message="onIpc"
    />
    <UiStateMessage v-if="web.state === 'starting'" align="center" class="pending" kind="loading">
      Opening the page…
    </UiStateMessage>
  </div>
</template>

<style scoped>
.web {
  @apply relative min-h-0 min-w-0 flex-1 overflow-hidden bg-raised;
}

iframe {
  @apply block size-full border-0 transition-opacity duration-(--duration-fast) ease-out;
}

/* Filled absolutely because an Electron <webview> does not take a percentage height the way an iframe does. */
webview {
  @apply absolute inset-0 border-0 transition-opacity duration-(--duration-fast) ease-out;
}

/* Held back until the agent is up, so a half-parsed page never shows under the loading line. */
iframe[data-state="starting"],
webview[data-state="starting"] {
  @apply opacity-0;
}

.pending {
  @apply absolute inset-0;
}

/* Done, it runs to the end before it fades, so a quick page still reads as finished rather than cut off. */
.progress {
  @apply pointer-events-none absolute inset-x-0 top-0 bottom-auto z-1 h-0.5 origin-left bg-primary opacity-0;
  transition:
    transform var(--duration-fast) var(--ease-out),
    opacity var(--duration-base) var(--ease-out) var(--duration-fast);
}

.progress[data-busy="true"] {
  @apply opacity-100 transition-none;
  animation: creep 12s var(--ease-out) forwards;
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
    @apply animate-none opacity-60;
  }
}
</style>
