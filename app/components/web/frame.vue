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
  type RelayNotice,
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

const chrome = useChrome();
const web = $web();
const artifact = $artifact();
const shown = useFaceShown();
const look = useTheme();
const frame = ref<HTMLIFrameElement>();
const place = ref<ProxyPlace>();
// With the extension the frame holds its relay page, which holds the site at its real address instead of the proxy.
const isRelayed = ref(false);
// The frame moves between the artifact's hosts as it goes from site to site, and a message only reaches the one it is on.
const on = ref<string>();
const src = ref<string>();
let started = 0;

async function start(): Promise<void> {
  const run = ++started;
  place.value = undefined;
  isRelayed.value = false;
  const at = web.page?.url ?? url;
  const relay = await Web.relay();
  if (run !== started) return;
  if (relay) {
    isRelayed.value = true;
    src.value = Web.relayed(relay, at);
    on.value = new URL(at).origin;
    return;
  }
  try {
    const got = await $fetch<WebServeReply>(`/api/web/${slug}/serve`, { method: "POST" });
    if (run !== started) return;
    const next = Web.placeOf({ here: new URL(location.href), port: got.port });
    const to = Web.proxied(at, next);
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

const site = (): Window | undefined =>
  (isRelayed.value ? frame.value?.contentWindow?.frames[0] : frame.value?.contentWindow) ?? undefined;

// Relayed, the site is whatever the page went to, so the window it speaks from is the whole check.
function isOurs({ origin, source }: MessageEvent): boolean {
  if (!source || source !== site()) return false;
  const at = place.value;
  return (
    isRelayed.value ||
    (!!at && URL.canParse(origin) && new URL(origin).port === String(at.port) && !!Web.upstream(origin, at.base))
  );
}

function post(message: SidecarMessage): void {
  if (on.value) site()?.postMessage({ ...message, channel: CHANNEL } satisfies Envelope<SidecarMessage>, on.value);
}

const realOf = (address: string): URL | undefined =>
  isRelayed.value ? new URL(address) : place.value && Web.upstream(address, place.value.base);

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

let offered: CommentOffer | undefined;

function onSelect(selection?: WebSelection): void {
  const box = frame.value?.getBoundingClientRect();
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
  if (!place.value && !isRelayed.value) return;
  web.isBusy = false;
  greet();
  emit("load");
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

useEventListener(window, "message", (event: MessageEvent<Partial<Envelope<AgentMessage>> | undefined>) => {
  if (event.data?.channel !== CHANNEL || !isOurs(event)) return;
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
      const address = realOf(message.page.url);
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
      return;
    case "select":
      onSelect(message.selection);
  }
});

// The extension says so again when it loads or reloads under an open sidecar, and a page already showing moves onto its relay.
useEventListener(document, "sidecar-relay", () => {
  if (src.value) web.reload();
});

// A relay's own load fires once, so the extension says when the site in it loads or fails, as the proxy's pages did.
useEventListener(document, "sidecar-relay-frame", (event: Event) => {
  if (!isRelayed.value || !src.value || !(event instanceof CustomEvent) || typeof event.detail !== "string") return;
  const notice = JSON.parse(event.detail) as RelayNotice;
  if (!URL.canParse(notice.relay) || new URL(notice.relay).href !== new URL(src.value).href) return;
  if (notice.type === "loaded") onLoad();
  else {
    web.state = "down";
    web.isBusy = false;
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
watch(chrome.comment.wide, (wide) => post({ type: "wide", wide }));
watch(chrome.comment.pick, (hit) => {
  if (!hit) post({ type: "clear" });
});
watch(
  () => web.stepping,
  (asked) => {
    const to = asked && (isRelayed.value ? asked.to : place.value && Web.proxied(asked.to, place.value));
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
      v-if="src && (place || isRelayed)"
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
  @apply relative min-h-0 min-w-0 flex-1 overflow-hidden bg-raised;
}

iframe {
  @apply block size-full border-0 transition-opacity duration-(--duration-fast) ease-out;
}

/* Held back until the agent is up, so a half-parsed page never shows under the loading line. */
iframe[data-state="starting"] {
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
  animation: creep 12s cubic-bezier(0.1, 0.65, 0.2, 1) forwards;
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
