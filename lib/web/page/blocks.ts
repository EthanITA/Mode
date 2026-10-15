export interface FrameAnchor {
  label: string;
  top: number;
}

export interface FrameBlock {
  height: number;
  top: number;
}

/** A block the frame can name as well as place, so a comment can outlive one render of it. */
export interface FrameMark extends FrameBlock {
  key: string;
  label: string;
  left: number;
  text: string;
  width: number;
}

export interface FramePending {
  id: string;
  left: number;
  path: string;
  replacement: string;
  top: number;
}

export interface Indexed {
  el: Element;
  key: string;
  label: string;
  text: string;
}

export interface BlockAtOptions {
  /** The block lit now, kept while the pointer crosses the gap to the next one. */
  hot?: Element;
  wide?: boolean;
}

export interface PageBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface PageSelection {
  block?: Element;
  /** The last line selected, in its own document's viewport, which is where the chip sits. */
  end: PageBox;
  quote: string;
}

export interface MeasureOptions {
  /** The outermost document read, so a block in a nested frame is placed in that one's viewport. */
  root?: Document;
  scroll?: number;
}

// Mirrors labelOf() in the review layer: the anchor label is the host section's own heading.
const HOSTS = "section, article, figure, .panel, .stage";
const HEADINGS = "h1, h2, h3, h4";
// What a container holds directly is a block too, so a thread anchored before picks got finer still finds its mark.
const WALK = "body, main, section, article, .page, .panel, .stage";
const OUTER = `html, ${WALK}`;
const MEDIA = "img, svg, canvas, video, iframe";
const SKIP = "script, style, template, noscript";
const LABEL_MAX = 44;
// Smaller than this a media element is an icon, which reads as part of its sentence.
const MEDIA_MIN = 32;

export function norm(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function displayOf(el: Element): string {
  return el.ownerDocument?.defaultView?.getComputedStyle(el).display ?? "block";
}

function boxy(el: Element): boolean {
  const display = displayOf(el);
  return display !== "inline" && display !== "contents";
}

// An inline-block chip or link reads as part of its sentence, so only a box in the flow is a block.
function flows(el: Element): boolean {
  const display = displayOf(el);
  return !display.startsWith("inline") && display !== "contents";
}

function sizable(el: Element): boolean {
  const { height, width } = el.getBoundingClientRect();
  return Math.min(height, width) >= MEDIA_MIN;
}

// Words in no box of their own are this box's, so it is the block a reader means.
function ownsText(el: Element): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === child.TEXT_NODE && norm(child.nodeValue ?? "")) return true;
    if (child.nodeType !== child.ELEMENT_NODE) continue;
    const inner = child as Element;
    if (!inner.matches(SKIP) && !inner.matches(MEDIA) && !flows(inner) && ownsText(inner)) return true;
  }
  return false;
}

function boxOf(node: Element): Element | undefined {
  let el: Element | undefined = node;
  while (el && !el.matches(OUTER) && !flows(el)) el = el.parentElement ?? undefined;
  return el && !el.matches(OUTER) ? el : undefined;
}

// A same-text wrapper is skipped, so ⌥ always lights something bigger than what it widens.
function outerOf(el: Element): Element {
  const words = norm(el.textContent);
  for (let up = el.parentElement; up && !up.matches(OUTER); up = up.parentElement) {
    if (flows(up) && norm(up.textContent) !== words) return up;
  }
  return el;
}

function wordsOf(el: Element): string {
  if (!el.matches(MEDIA)) return norm(el.textContent);
  const named = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("alt");
  const src = el.getAttribute("src")?.split(/[?#]/)[0]?.split("/").pop();
  return norm(named || el.textContent || src || el.tagName.toLowerCase());
}

// A wrapper holding one block child with the same words is not a block of its own.
function tighten(el: Element): Element {
  let node = el;
  for (;;) {
    const [only] = node.children;
    if (node.children.length !== 1 || !only || !boxy(only)) return node;
    if (norm(node.textContent) !== norm(only.textContent)) return node;
    node = only;
  }
}

// A page is operated, so it owns real inputs; a letter typed into one is never a shortcut.
export function isTyping(target: unknown): boolean {
  const node = target as Element | undefined;
  return Boolean(node?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

// The frame is a second realm, so `instanceof Element` from outside is always false; duck-typing is the only test.
export function blockAt(target: unknown, { hot, wide = false }: BlockAtOptions = {}): Element | undefined {
  const node = target as Element | undefined;
  if (!node?.closest || node.closest(SKIP)) return undefined;
  const media = node.closest(MEDIA);
  if (media && sizable(media)) return wide ? outerOf(media) : media;
  const box = boxOf(media ?? node);
  if (box && ownsText(box)) return wide ? outerOf(box) : box;
  if (wide && box && norm(box.textContent)) return box;
  // A margin between two paragraphs belongs to their wrapper, which would flash the whole of it.
  const around = box ?? node.closest(OUTER);
  return hot && around && !around.matches("html, body") && around.contains(hot) ? hot : undefined;
}

// A triple click ends the range on an empty box at the start of the next block, which is not where the words end.
function lastLine(range: Range): PageBox {
  const lines = [...range.getClientRects()].filter((line) => line.width > 0);
  const { bottom, left, right, top } = lines.at(-1) ?? range.getBoundingClientRect();
  return { bottom, left, right, top };
}

export function selectionIn(doc: Document): PageSelection | undefined {
  const selection = doc.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return undefined;
  const range = selection.getRangeAt(selection.rangeCount - 1);
  const quote = norm(selection.toString());
  const common = range.commonAncestorContainer;
  const host = common.nodeType === common.ELEMENT_NODE ? (common as Element) : common.parentElement;
  if (!quote || !host || isTyping(host)) return undefined;
  const start = range.startContainer.parentElement ?? undefined;
  return { block: blockAt(host) ?? boxOf(host) ?? blockAt(start), end: lastLine(range), quote };
}

export function originIn(doc: Document, root: Document): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let at = doc; at !== root;) {
    const frame = at.defaultView?.frameElement;
    if (!frame) break;
    const box = frame.getBoundingClientRect();
    x += box.x + frame.clientLeft;
    y += box.y + frame.clientTop;
    at = frame.ownerDocument;
  }
  return { x, y };
}

export function rectIn(el: Element, root: Document): DOMRect {
  const box = el.getBoundingClientRect();
  const { x, y } = originIn(el.ownerDocument, root);
  return new DOMRect(box.x + x, box.y + y, box.width, box.height);
}

// Another origin's frame answers null, and is reached only through the agent it runs, or not at all.
export function framesIn(doc: Document, isOwned: (inner: Document) => boolean = () => false): Document[] {
  const out = [doc];
  for (const frame of doc.querySelectorAll("iframe")) {
    const inner = frame.contentDocument;
    if (inner?.documentElement && !isOwned(inner)) out.push(...framesIn(inner, isOwned));
  }
  return out;
}

export function pathOf(node: Element): string {
  const parts: string[] = [];
  const doc = node.ownerDocument;
  for (let n: Element | undefined = node; n && n !== doc?.body; n = n.parentElement ?? undefined) {
    if (n.id) {
      const id = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(n.id) : n.id;
      parts.unshift(`#${id}`);
      break;
    }
    const tag = n.tagName.toLowerCase();
    const parent = n.parentElement;
    const kin = parent ? [...parent.children].filter((c) => c.tagName === n.tagName) : [];
    parts.unshift(kin.length > 1 ? `${tag}:nth-of-type(${kin.indexOf(n) + 1})` : tag);
  }
  return parts.join(" > ");
}

function labelOf(el: Element): string {
  return norm(el.closest(HOSTS)?.querySelector(HEADINGS)?.textContent).slice(0, LABEL_MAX);
}

export function readAnchors(doc: Document, scroll: number): FrameAnchor[] {
  const out: FrameAnchor[] = [];
  const seen = new Set<string>();
  for (const host of doc.querySelectorAll<HTMLElement>(HOSTS)) {
    const label = norm(host.querySelector(HEADINGS)?.textContent).slice(0, LABEL_MAX);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, top: host.getBoundingClientRect().top + scroll });
  }
  return out;
}

// The mirror of blockAt(): a pick this walk misses has no key and cannot be anchored.
export function indexBlocks(doc: Document, indexed: Indexed[] = []): Indexed[] {
  const held = new Set<Element>(indexed.map(({ el }) => el));
  const take = (el: Element): void => {
    if (held.has(el) || el.matches(SKIP)) return;
    const text = wordsOf(el);
    if (!text) return;
    held.add(el);
    indexed.push({
      el,
      key: `${indexed.length}:${el.tagName.toLowerCase()}`,
      label: labelOf(el) || text.slice(0, LABEL_MAX),
      text,
    });
  };
  for (const host of doc.querySelectorAll(WALK)) {
    for (const child of host.children) {
      if (!child.matches(OUTER)) take(tighten(child));
    }
  }
  // Every box from the words up to their container, since ⌥ and a gap can each light any of them.
  const words = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  for (let text = words.nextNode(); text; text = words.nextNode()) {
    const parent = text.parentElement;
    if (!parent || !norm(text.nodeValue ?? "") || parent.closest(`${SKIP}, svg`)) continue;
    for (let box = boxOf(parent); box && !held.has(box); box = box.parentElement ? boxOf(box.parentElement) : undefined)
      take(box);
  }
  for (const el of doc.querySelectorAll(MEDIA)) {
    if (!el.parentElement?.closest("svg") && sizable(el)) take(el);
  }
  return indexed;
}

export function measure(indexed: Indexed[], { root, scroll = 0 }: MeasureOptions = {}): FrameMark[] {
  return indexed.map(({ el, key, label, text }) => {
    const box = root ? rectIn(el, root) : el.getBoundingClientRect();
    return { height: box.height, key, label, left: box.left, text, top: box.top + scroll, width: box.width };
  });
}

export function indexedOf(indexed: Indexed[], el: Element): Indexed | undefined {
  return indexed.find((one) => one.el === el) ?? indexed.find((one) => el.contains(one.el));
}

export function locate(indexed: Indexed[], doc: Document, hit?: { path: string; text: string }): Element | undefined {
  if (!hit) return undefined;
  const want = hit.text.slice(0, 160);
  if (want) {
    const exact = indexed.filter((one) => one.text.slice(0, 160) === want);
    if (exact[0]) return exact[0].el;
    const head = want.slice(0, 60);
    const near = indexed.filter((one) => one.text.startsWith(head));
    if (near[0]) return near[0].el;
  }
  try {
    return hit.path ? (doc.querySelector(hit.path) ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

export function readPending(doc: Document, scroll: number): FramePending[] {
  const out: FramePending[] = [];
  const seen = new Set<string>();
  for (const del of doc.querySelectorAll("del[data-sc-edit]")) {
    const id = del.getAttribute("data-sc-edit") ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ins = doc.querySelector(`ins[data-sc-edit="${CSS.escape(id)}"]`);
    const host = del.parentElement;
    if (!host) continue;
    const box = (ins ?? del).getBoundingClientRect();
    out.push({
      id,
      left: box.right,
      path: pathOf(host),
      replacement: norm(ins?.textContent || undefined),
      top: box.top + scroll,
    });
  }
  return out;
}
