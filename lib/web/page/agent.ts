import {
  blockAt,
  type FrameMark,
  framesIn,
  type Indexed,
  indexBlocks,
  indexedOf,
  isTyping,
  locate,
  measure,
  originIn,
  type PageBox,
  pathOf,
  readAnchors,
  rectIn,
  selectionIn,
} from "./blocks.ts";
import type { WebArrival } from "../../../shared/types/web.ts";
import { isAddressKey, stepOf } from "./keys.ts";
import {
  type AgentMessage,
  CHANNEL,
  type Envelope,
  type SidecarMessage,
  type WebHit,
  type WebSelection,
} from "./protocol.ts";

interface ChildState {
  hot?: WebHit;
  marks: FrameMark[];
  picked?: WebHit;
}

const parents = new Set((new URL(import.meta.url).searchParams.get("parent") ?? "").split(",").filter(Boolean));
// Set on the window by the desktop shell's webview preload right before this script, so the page is a real top-level one.
const shell = Reflect.get(window, "__sidecarShell") === true;
if (shell) Reflect.deleteProperty(window, "__sidecarShell");
// The site's own frames run this agent too, and answer to the page around them, which relays them to the sidecar.
const nested = window.parent !== window.top;
// A same-origin frame running its own agent is that agent's to read, or every block in it would answer twice.
const AGENT = Symbol.for("sidecar-agent");
Reflect.set(window, AGENT, true);
const nav = "navigation" in window ? window.navigation : undefined;

let how: WebArrival = nav?.activation?.navigationType ?? "push";
let parent: string | undefined;
let armed = false;
let wide = false;
let resting: EventTarget | undefined;
let holdCode: string | undefined;
let theme: string | undefined;
let indexed: Indexed[] = [];
let hot: Element | undefined;
let picked: { el: Element; path: string; text: string } | undefined;
let selectedIn: Document | undefined;
let stale = true;
let frame = 0;
let shown = "";
const bound = new WeakSet<Document>();
// Kept as each frame last said it, and offset by where the frame sits only when sent, since the page scrolls under it.
const children = new Map<HTMLIFrameElement, ChildState>();

function post(message: AgentMessage): void {
  const envelope = { ...message, channel: CHANNEL } satisfies Envelope<AgentMessage>;
  // In the shell the page talks to its own window, where the webview preload is listening to carry it to the sidecar.
  if (shell) window.postMessage({ data: envelope, sidecar: "up" }, "*");
  else if (parent) window.parent.postMessage(envelope, parent);
}

function tell(message: SidecarMessage, to: HTMLIFrameElement, origin = "*"): void {
  to.contentWindow?.postMessage({ ...message, channel: CHANNEL } satisfies Envelope<SidecarMessage>, origin);
}

function hitOf(el: Element | undefined): WebHit | undefined {
  const held = el && indexedOf(indexed, el);
  if (!el || !held) return undefined;
  const box = rectIn(el, document);
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

function frames(): HTMLIFrameElement[] {
  return [...document.querySelectorAll("iframe")];
}

// The frame's place goes into the key, so one frame's "3:p" never answers for another's.
function shift<T extends { key: string; left: number; top: number }>(item: T, from: HTMLIFrameElement): T {
  const box = from.getBoundingClientRect();
  return {
    ...item,
    key: `${frames().indexOf(from)}/${item.key}`,
    left: item.left + box.left + from.clientLeft,
    top: item.top + box.top + from.clientTop,
  };
}

function shiftBox(end: PageBox, from: HTMLIFrameElement): PageBox {
  const box = from.getBoundingClientRect();
  const x = box.left + from.clientLeft;
  const y = box.top + from.clientTop;
  return { bottom: end.bottom + y, left: end.left + x, right: end.right + x, top: end.top + y };
}

function selectionOf(doc: Document): WebSelection | undefined {
  const selection = selectionIn(doc);
  const hit = selection?.block && hitOf(selection.block);
  if (!selection || !hit) return undefined;
  const { x, y } = originIn(doc, document);
  const { bottom, left, right, top } = selection.end;
  return { end: { bottom: bottom + y, left: left + x, right: right + x, top: top + y }, hit, quote: selection.quote };
}

function postSelection(doc: Document): void {
  const selection = selectionOf(doc);
  if (!selection && selectedIn !== doc) return;
  selectedIn = selection ? doc : undefined;
  post({ type: "select", selection });
}

function clearSelection(): void {
  if (!selectedIn) return;
  selectedIn = undefined;
  post({ type: "select" });
}

function layout(): void {
  frame = 0;
  if (stale) {
    const docs = framesIn(document, (inner) => Reflect.get(inner.defaultView ?? {}, AGENT) === true);
    indexed = docs.reduce<Indexed[]>((into, doc) => indexBlocks(doc, into), []);
    for (const doc of docs) bind(doc);
    stale = false;
    // A re-render swaps the picked node for a new one with the same words.
    if (picked && !picked.el.isConnected) {
      const again = locate(indexed, document, picked);
      picked = again ? { ...picked, el: again } : undefined;
    }
  }
  if (!nested) {
    const icon = document.querySelector<HTMLLinkElement>("link[rel~='icon']")?.href || `${location.origin}/favicon.ico`;
    const page = `${location.href}\n${document.title}\n${icon}`;
    if (page !== shown) {
      shown = page;
      post({ type: "page", how, page: { icon, title: document.title, url: location.href } });
    }
  }
  const kids = [...children].filter(([el]) => el.isConnected);
  const own = hot && hot === picked?.el ? undefined : hitOf(hot);
  post({
    type: "layout",
    anchors: nested ? [] : readAnchors(document, 0),
    hot: own ?? kids.map(([el, kid]) => kid.hot && shift(kid.hot, el)).find(Boolean),
    marks: [
      ...measure(indexed, { root: document }),
      ...kids.flatMap(([el, kid]) => kid.marks.map((mark) => shift(mark, el))),
    ],
    picked: hitOf(picked?.el) ?? kids.map(([el, kid]) => kid.picked && shift(kid.picked, el)).find(Boolean),
  });
  if (selectedIn) postSelection(selectedIn);
}

function schedule(reindex = false): void {
  stale ||= reindex;
  if (!frame && parent) frame = requestAnimationFrame(layout);
}

// A new tab or the window above would take the page out of the sidecar, so those links open in place.
function leave(event: MouseEvent): void {
  const link = (event.target as Element | undefined)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
  const target = link.target || document.querySelector<HTMLBaseElement>("base[target]")?.target || "";
  if (!/^_(blank|parent|top)$/i.test(target) || !/^https?:$/.test(new URL(link.href, location.href).protocol)) return;
  event.preventDefault();
  location.assign(link.href);
}

// The frame's own entry when it is the page asked for, which keeps an app's state; a frame that forgot it loads it in place.
function step(by: -1 | 1, to: string): void {
  const index = nav?.currentEntry?.index ?? -1;
  const next = index < 0 ? undefined : nav?.entries()[index + by];
  if (!nav || next?.url !== to) {
    location.replace(to);
    return;
  }
  const { committed, finished } = nav.traverseTo(next.key);
  committed?.catch(() => undefined);
  finished?.catch(() => undefined);
}

// ⌥ changes what the resting pointer means, and nothing else would light the new block until it moved.
function widen(on: boolean): void {
  if (wide === on) return;
  wide = on;
  if (!armed || !resting) return;
  hot = blockAt(resting, { wide });
  schedule();
}

function onKeyDown(event: KeyboardEvent): void {
  const meta = event.metaKey || event.ctrlKey;
  const by = isTyping(event.target) ? undefined : stepOf(event);
  if (event.key === "Alt") {
    widen(true);
    post({ type: "key", key: "wide" });
  } else if (by) {
    event.preventDefault();
    post({ type: "key", key: by < 0 ? "back" : "forward" });
  } else if (isAddressKey(event)) {
    event.preventDefault();
    post({ type: "key", key: "address" });
  } else if (meta && event.key.toLowerCase() === "k") {
    event.preventDefault();
    post({ type: "key", key: "comment" });
  } else if (meta && event.key.toLowerCase() === "r") {
    event.preventDefault();
    post({ type: "key", key: "reload" });
  } else if (meta && !isTyping(event.target) && event.key === "Backspace") {
    post({ type: "key", key: "remove" });
  } else if (meta && !event.shiftKey && !isTyping(event.target) && event.key.toLowerCase() === "z") {
    post({ type: "key", key: "undo" });
  } else if (event.key === "Escape" && armed) {
    event.preventDefault();
    post({ type: "key", key: "escape" });
  } else if (event.key === "Escape") {
    // Read once the site has had the press, so closing its own dialog doesn't also leave fullscreen.
    setTimeout(() => event.defaultPrevented || post({ type: "key", key: "escape" }));
  } else if (!meta && !event.altKey && !isTyping(event.target) && event.key.toLowerCase() === "c" && !event.repeat) {
    holdCode = event.code;
    post({ type: "key", key: "hold" });
  } else if (!meta && !event.altKey && !isTyping(event.target) && event.key.toLowerCase() === "f" && !event.repeat) {
    post({ type: "key", key: "full" });
  }
}

function bind(doc: Document): void {
  const win = doc.defaultView;
  if (!win || bound.has(doc)) return;
  bound.add(doc);

  // Armed, the site must not see a press on a block, but its default still runs so a drag selects words.
  const press = (event: Event): void => {
    if (event.type === "pointerdown") clearSelection();
    if (armed && blockAt(event.target, { hot })) event.stopImmediatePropagation();
  };
  const click = (event: MouseEvent): void => {
    if (!armed) {
      if (doc === document) leave(event);
      return;
    }
    const node = blockAt(event.target, { hot, wide: event.altKey });
    if (!node) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (doc.getSelection()?.isCollapsed === false) return;
    const hit = hitOf(node);
    if (!hit) return;
    picked = { el: node, path: hit.path, text: hit.text };
    hot = node;
    post({ type: "pick", hit });
  };

  for (const type of ["pointerdown", "mousedown"]) win.addEventListener(type, press, true);
  win.addEventListener("click", click, true);
  win.addEventListener(
    "mousemove",
    (event) => {
      resting = event.target ?? undefined;
      if (event.altKey !== wide) post({ type: "key", key: event.altKey ? "wide" : "narrow" });
      widen(event.altKey);
      if (!armed) return;
      const next = blockAt(event.target, { hot, wide: event.altKey });
      if (next === hot) return;
      hot = next;
      schedule();
    },
    true,
  );
  doc.addEventListener("mouseleave", () => {
    resting = undefined;
    hot = undefined;
    schedule();
  });
  // The selection settles after the release, so it is read on the next frame.
  win.addEventListener("pointerup", () => requestAnimationFrame(() => postSelection(doc)), true);
  doc.addEventListener("selectionchange", () => {
    if (selectedIn === doc && doc.getSelection()?.isCollapsed !== false) clearSelection();
  });
  win.addEventListener("keydown", onKeyDown, true);
  win.addEventListener(
    "keyup",
    (event) => {
      postSelection(doc);
      if (event.key === "Alt") {
        widen(false);
        post({ type: "key", key: "narrow" });
      }
      // By the physical key, since ⌥ held over it turns the c of its release into a ç on a Mac.
      if (event.code === (holdCode ?? "KeyC")) {
        holdCode = undefined;
        post({ type: "key", key: "release" });
      }
    },
    true,
  );
  win.addEventListener("scroll", () => schedule(), true);
}

function fromChild(from: HTMLIFrameElement, origin: string, message: Envelope<AgentMessage>): void {
  switch (message.type) {
    case "ready":
      tell({ type: "hello" }, from, origin);
      tell({ type: "arm", armed }, from, origin);
      tell({ type: "wide", wide }, from, origin);
      if (theme) tell({ type: "theme", theme }, from, origin);
      return;
    case "layout":
      children.set(from, { hot: message.hot, marks: message.marks, picked: message.picked });
      schedule();
      return;
    case "pick":
      post({ type: "pick", hit: shift(message.hit, from) });
      return;
    case "select": {
      const { selection } = message;
      post({
        type: "select",
        selection: selection && { ...selection, end: shiftBox(selection.end, from), hit: shift(selection.hit, from) },
      });
      return;
    }
    case "key":
      post({ type: "key", key: message.key });
  }
}

bind(document);
window.addEventListener("resize", () => schedule());
window.addEventListener("popstate", () => schedule(true));
window.addEventListener("hashchange", () => schedule(true));
nav?.addEventListener("currententrychange", (event) => {
  how = event.navigationType ?? "push";
  schedule();
});
// The bootstrap may have cancelled it to send it through the proxy, in which case the one it starts says so instead.
nav?.addEventListener("navigate", (event) => {
  if (!event.defaultPrevented && !event.destination.sameDocument && !event.hashChange)
    post({ type: "busy", busy: true });
});
// A page that intercepts its own navigations never loads a new document, so it says when it is done instead.
for (const type of ["navigatesuccess", "navigateerror"])
  nav?.addEventListener(type, () => post({ type: "busy", busy: false }));
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

function greeted(origin: string): void {
  parent = origin;
  shown = "";
  schedule(true);
}

function applySidecar(message: Envelope<SidecarMessage>): void {
  if (message.type === "arm") {
    armed = message.armed;
    hot = armed && resting ? blockAt(resting, { wide }) : undefined;
    if (!armed) picked = undefined;
    for (const one of frames()) tell(message, one);
    schedule();
  } else if (message.type === "wide") {
    widen(message.wide);
    for (const one of frames()) tell(message, one);
  } else if (message.type === "clear") {
    hot = undefined;
    picked = undefined;
    for (const one of frames()) tell(message, one);
    schedule();
  } else if (message.type === "step") {
    step(message.by, message.to);
  } else if (message.type === "theme") {
    theme = message.theme;
    document.documentElement.setAttribute("data-theme", message.theme);
    for (const one of frames()) tell(message, one);
  }
}

window.addEventListener("message", (event: MessageEvent<Partial<Envelope<AgentMessage | SidecarMessage>>>) => {
  if (shell) {
    const relay = event.data as { data?: Envelope<SidecarMessage>; sidecar?: string };
    if (relay?.sidecar !== "down") return;
    const message = relay.data;
    if (message?.channel !== CHANNEL) return;
    if (message.type === "hello") greeted("shell");
    else applySidecar(message);
    return;
  }
  if (event.data?.channel !== CHANNEL) return;
  const from = frames().find((one) => one.contentWindow === event.source);
  if (from) {
    fromChild(from, event.origin, event.data as Envelope<AgentMessage>);
    return;
  }
  if (event.source !== window.parent || (!nested && !parents.has(event.origin))) return;
  const message = event.data as Envelope<SidecarMessage>;
  if (message.type === "hello") {
    greeted(event.origin);
    return;
  }
  if (event.origin !== parent) return;
  applySidecar(message);
});

// A frame whose agent ran before this one said ready to nobody, so it is greeted now; a later one says ready itself.
for (const one of frames()) tell({ type: "hello" }, one);

// Said once the document is parsed, so the sidecar shows the page without waiting on every subresource and nested frame.
if (shell) {
  post({ type: "ready" });
} else if (window.parent !== window) {
  const ready = { type: "ready", channel: CHANNEL } satisfies Envelope<AgentMessage>;
  if (nested) window.parent.postMessage(ready, "*");
  else for (const to of parents) window.parent.postMessage(ready, to);
}
