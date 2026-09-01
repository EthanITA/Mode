import { readFileSync } from "node:fs";

type Attrs = Record<string, unknown>;

interface Stub {
  tagName: string;
  children: Stub[];
  attrs: Attrs;
  style: Attrs;
  dataset: Record<string, string>;
  classList: { add(): void; remove(): void; toggle(): void; contains(): boolean };
  setAttribute(k: string, v: unknown): void;
  getAttribute(k: string): unknown;
  removeAttribute(k: string): void;
  appendChild(c: Stub): Stub;
  append(...c: Stub[]): void;
  insertAdjacentHTML(pos: string, html: string): void;
  addEventListener(): void;
  removeEventListener(): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  querySelector(): undefined;
  querySelectorAll(): Stub[];
  closest(): undefined;
  focus(): void;
  offsetWidth: number;
  offsetHeight: number;
  clientWidth: number;
  clientHeight: number;
  textContent: string;
  innerHTML: string;
  hidden: boolean;
  tabIndex: number;
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node smoke-artifact.ts <file.html>");
  console.error("  runs the page's own inline scripts against a stubbed DOM");
  process.exit(2);
}

const src = readFileSync(file, "utf8");
const bad: string[] = [];
let created = 0;

const flag = (where: string, key: string, v: unknown): void => {
  const s = String(v);
  const absent = v === undefined || v === null; // external contract: page code passes either, and 0 and "" must survive
  if (absent || /NaN|undefined/.test(s)) bad.push(`${where}.${key} = "${s.slice(0, 80)}"`);
};

const node = (tag: string): Stub => {
  created++;
  let html = "";
  let text = "";
  const self: Stub = {
    tagName: tag,
    children: [],
    attrs: {},
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { flag(tag, k, v); this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); },
    insertAdjacentHTML(_pos, h) { flag(tag, "insertAdjacentHTML", h); html += h; },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 400 }),
    querySelector: () => undefined,
    querySelectorAll: () => [],
    closest: () => undefined,
    focus() {},
    offsetWidth: 900,
    offsetHeight: 400,
    clientWidth: 900,
    clientHeight: 400,
    hidden: false,
    tabIndex: 0,
    get textContent() { return text; },
    set textContent(v: string) { flag(tag, "textContent", v); text = v; },
    get innerHTML() { return html; },
    set innerHTML(v: string) { flag(tag, "innerHTML", v); html = v; }
  };
  return self;
};

const hosts: Record<string, Stub> = {};
const root = node("html");

const g = globalThis as Record<string, unknown>;
g.document = {
  documentElement: root,
  body: node("body"),
  head: node("head"),
  createElement: (t: string) => node(t),
  createElementNS: (_ns: string, t: string) => node(t),
  createTextNode: () => node("#text"),
  getElementById: (id: string) => (hosts[id] = hosts[id] ?? node(id)),
  querySelector: () => undefined,
  querySelectorAll: () => [],
  addEventListener: () => {},
  dispatchEvent: () => true
};
g.window = g;
g.location = { hash: "#/", href: "file://local", search: "" };
g.devicePixelRatio = 2;
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.dispatchEvent = () => true;
g.scrollTo = () => {};
g.requestAnimationFrame = () => 0;
g.cancelAnimationFrame = () => {};
g.setTimeout = () => 0;
g.matchMedia = () => ({ matches: false, addEventListener: () => {}, addListener: () => {} });
g.performance = { now: () => 0 };
g.CustomEvent = class { type: string; constructor(type: string) { this.type = type; } };
g.IntersectionObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
// the stub parses no CSS, so token reads would come back empty and cascade into NaN
g.getComputedStyle = () => ({ getPropertyValue: () => "#000000", fontSize: "16px" });

// only bare <script> blocks: a type="module" block uses import, which eval cannot resolve
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

let threw = 0;
for (const [i, code] of blocks.entries()) {
  try {
    (0, eval)(code);
  } catch (e) {
    threw++;
    console.log(`  THREW    block ${i + 1}: ${(e as Error).message}`);
  }
}

// an element shipped empty is a data hole the script is meant to fill
const holes = [...src.matchAll(
  /<(div|span|p|tbody|thead|ol|ul|section|table|figure|figcaption|strong|em|b|td|th|h[1-6]|main|aside|canvas)\b[^>]*\sid="([^"]+)"[^>]*>\s*<\/\1>/g
)].map(m => m[2]);

let unfilled = 0;
for (const id of holes) {
  const n = hosts[id];
  const filled = (n?.innerHTML?.length ?? 0) + (n?.textContent?.length ?? 0) + (n?.children.length ?? 0);
  if (!filled) { console.log(`  EMPTY    ${id}`); unfilled++; }
  else console.log(`  ok       ${id.padEnd(16)} ${String(filled).padStart(6)}`);
}

console.log(`\nscript blocks ${blocks.length}, nodes created ${created}, data holes ${holes.length}`);
if (!holes.length) console.log("note: no empty id-bearing elements found, so only script errors were checked");
if (bad.length) {
  console.log(`\nBAD VALUES (${bad.length}):`);
  bad.slice(0, 20).forEach(b => console.log("   " + b));
}
process.exit(unfilled || bad.length || threw ? 1 : 0);
