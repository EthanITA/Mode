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

// Mirrors labelOf() in the review layer: the anchor label is the host section's own heading.
const HOSTS = "section, article, figure, .panel, .stage";
const HEADINGS = "h1, h2, h3, h4";
// A block is whatever a container holds directly, so an unnamed div is as pickable as a <p>.
const WALK = "body, main, section, article, .page, .panel, .stage";
const OUTER = `html, ${WALK}`;
const OWN = "li, tr, dt, dd, figcaption";
const SKIP = "script, style, template, noscript";
const LABEL_MAX = 44;

export function norm(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function boxy(el: Element): boolean {
  const display = el.ownerDocument?.defaultView?.getComputedStyle(el).display ?? "block";
  return display !== "inline" && display !== "contents";
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
export function blockAt(target: unknown): Element | undefined {
  const node = target as Element | undefined;
  if (!node?.closest) return undefined;
  const own = node.closest(OWN);
  if (own) return own;
  let el: Element | undefined = node;
  while (el?.parentElement && !el.parentElement.matches(OUTER)) el = el.parentElement;
  return el && !el.matches(OUTER) && !el.matches(SKIP) ? tighten(el) : undefined;
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
export function indexBlocks(doc: Document): Indexed[] {
  const indexed: Indexed[] = [];
  const held = new Set<Element>();
  const take = (el: Element): void => {
    if (held.has(el) || el.matches(SKIP)) return;
    const text = norm(el.textContent);
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
  for (const el of doc.querySelectorAll(OWN)) take(el);
  return indexed;
}

export function measure(indexed: Indexed[], scroll: number): FrameMark[] {
  return indexed.map(({ el, key, label, text }) => {
    const box = el.getBoundingClientRect();
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
