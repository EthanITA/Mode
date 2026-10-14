import {
  blockAt,
  type Indexed,
  indexBlocks,
  indexedOf,
  isTyping,
  locate,
  measure,
  pathOf,
  readAnchors,
} from "./blocks.ts";
import { type AgentMessage, CHANNEL, type Envelope, type SidecarMessage, type WebHit } from "./protocol.ts";

const parents = new Set((new URL(import.meta.url).searchParams.get("parent") ?? "").split(",").filter(Boolean));

let parent: string | undefined;
let armed = false;
let indexed: Indexed[] = [];
let hot: Element | undefined;
let picked: { el: Element; path: string; text: string } | undefined;
let stale = true;
let frame = 0;
let shown = "";

function post(message: AgentMessage): void {
  if (parent) window.parent.postMessage({ ...message, channel: CHANNEL } satisfies Envelope<AgentMessage>, parent);
}

function hitOf(el: Element | undefined): WebHit | undefined {
  const held = el && indexedOf(indexed, el);
  if (!el || !held) return undefined;
  const box = el.getBoundingClientRect();
  return {
    height: box.height,
    key: held.key,
    label: held.label,
    left: box.left,
    path: pathOf(el),
    text: held.text,
    top: box.top,
    width: box.width,
  };
}

function layout(): void {
  frame = 0;
  if (stale) {
    indexed = indexBlocks(document);
    stale = false;
    // A re-render swaps the picked node for a new one with the same words.
    if (picked && !picked.el.isConnected) {
      const again = locate(indexed, document, picked);
      picked = again ? { ...picked, el: again } : undefined;
    }
  }
  const page = `${location.href}\n${document.title}`;
  if (page !== shown) {
    shown = page;
    post({ type: "page", page: { title: document.title, url: location.href } });
  }
  post({
    type: "layout",
    anchors: readAnchors(document, 0),
    hot: hot === picked?.el ? undefined : hitOf(hot),
    marks: measure(indexed, 0),
    picked: hitOf(picked?.el),
  });
}

function schedule(reindex = false): void {
  stale ||= reindex;
  if (!frame && parent) frame = requestAnimationFrame(layout);
}

// Another site would load in the frame without the agent, and most refuse to be framed at all.
function leave(event: MouseEvent): void {
  const link = (event.target as Element | undefined)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || event.defaultPrevented) return;
  const to = new URL(link.href, location.href);
  if (to.origin === location.origin || !/^https?:$/.test(to.protocol)) return;
  event.preventDefault();
  post({ type: "away", url: to.href });
}

function pick(event: MouseEvent): void {
  if (!armed) {
    if (event.type === "click") leave(event);
    return;
  }
  const node = blockAt(event.target);
  if (!node) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type !== "click") return;
  const hit = hitOf(node);
  if (!hit) return;
  picked = { el: node, path: hit.path, text: hit.text };
  hot = node;
  post({ type: "pick", hit });
}

// Armed, a press on a block is a pick, so the app must not see the press that started it either.
for (const type of ["pointerdown", "mousedown", "click"]) window.addEventListener(type, pick as EventListener, true);

window.addEventListener(
  "mousemove",
  (event) => {
    if (!armed) return;
    const next = blockAt(event.target);
    if (next === hot) return;
    hot = next;
    schedule();
  },
  true,
);
document.addEventListener("mouseleave", () => {
  hot = undefined;
  schedule();
});

window.addEventListener(
  "keydown",
  (event) => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "k") {
      event.preventDefault();
      post({ type: "key", key: "comment" });
    } else if (meta && event.key.toLowerCase() === "r") {
      event.preventDefault();
      post({ type: "key", key: "reload" });
    } else if (meta && !isTyping(event.target) && event.key === "Backspace") {
      post({ type: "key", key: "remove" });
    } else if (meta && !event.shiftKey && !isTyping(event.target) && event.key.toLowerCase() === "z") {
      post({ type: "key", key: "undo" });
    } else if (event.key === "Escape") {
      if (armed) event.preventDefault();
      post({ type: "key", key: "escape" });
    } else if (!meta && !event.altKey && !isTyping(event.target) && event.key.toLowerCase() === "c" && !event.repeat) {
      post({ type: "key", key: "hold" });
    } else if (!meta && !event.altKey && !isTyping(event.target) && event.key.toLowerCase() === "f" && !event.repeat) {
      post({ type: "key", key: "full" });
    }
  },
  true,
);
window.addEventListener(
  "keyup",
  (event) => {
    if (event.key.toLowerCase() === "c") post({ type: "key", key: "release" });
  },
  true,
);

window.addEventListener("scroll", () => schedule(), true);
window.addEventListener("resize", () => schedule());
window.addEventListener("popstate", () => schedule(true));
window.addEventListener("hashchange", () => schedule(true));
for (const name of ["pushState", "replaceState"] as const) {
  const native = history[name];
  history[name] = function (this: History, ...args: Parameters<History["pushState"]>): void {
    native.apply(this, args);
    schedule(true);
  };
}
new MutationObserver(() => schedule(true)).observe(document.documentElement, {
  characterData: true,
  childList: true,
  subtree: true,
});

window.addEventListener("message", (event: MessageEvent<Partial<Envelope<SidecarMessage>>>) => {
  if (event.source !== window.parent || !parents.has(event.origin) || event.data?.channel !== CHANNEL) return;
  const message = event.data as Envelope<SidecarMessage>;
  if (message.type === "hello") {
    parent = event.origin;
    shown = "";
    schedule(true);
    return;
  }
  if (event.origin !== parent) return;
  if (message.type === "arm") {
    armed = message.armed;
    if (!armed) {
      hot = undefined;
      picked = undefined;
    }
    schedule();
  } else if (message.type === "clear") {
    hot = undefined;
    picked = undefined;
    schedule();
  } else if (message.type === "go") {
    location.assign(new URL(message.path, location.origin).href);
  }
});

// Said once the document is parsed, so the sidecar shows the page without waiting on every subresource and nested frame.
if (window.parent !== window)
  for (const to of parents)
    window.parent.postMessage({ type: "ready", channel: CHANNEL } satisfies Envelope<AgentMessage>, to);
