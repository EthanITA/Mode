import type { Directive } from "vue";

const SVG_NS = "http://www.w3.org/2000/svg";
// feDisplacementMap reads scale * (channel - 0.5), so mid-grey is "don't move".
const NEUTRAL = 128;
// A size tween would otherwise rebuild the map every frame. feImage stretches
// over the remainder, and 8px of stretch is invisible on a rim this soft.
const SIZE_STEP = 8;
// One matrix per displacement pass, each keeping a single channel plus alpha.
const CHANNELS = [
  "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
  "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0",
  "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0",
];

type Optics = {
  scale: number;
  softness: number;
  spread: number;
};

type Box = {
  band: number;
  height: number;
  radius: number;
  width: number;
};

type Lens = {
  filter: SVGFilterElement;
  frame?: number;
  id: string;
  key?: string;
  observer: ResizeObserver;
};

const lenses = new WeakMap<HTMLElement, Lens>();

let defs: SVGSVGElement | undefined;
let seq = 0;
let support: boolean | undefined;

// Chromium alone resolves a url() inside backdrop-filter; Safari and Firefox
// parse-fail it, which is what leaves them on the plain frosted fallback.
function supported(): boolean {
  support ??= CSS.supports("backdrop-filter", "url(#a) blur(1px)");
  return support;
}

function defsRoot(): SVGSVGElement {
  if (defs) return defs;
  defs = document.createElementNS(SVG_NS, "svg");
  defs.setAttribute("aria-hidden", "true");
  defs.setAttribute("focusable", "false");
  defs.classList.add("glass-defs");
  document.body.append(defs);
  return defs;
}

function token(style: CSSStyleDeclaration, name: string): number {
  return Number.parseFloat(style.getPropertyValue(name)) || 0;
}

function readOptics(style: CSSStyleDeclaration): Optics {
  return {
    scale: token(style, "--glass-refraction-scale"),
    softness: token(style, "--glass-refraction-softness"),
    spread: token(style, "--glass-refraction-spread"),
  };
}

function readBox(el: HTMLElement, style: CSSStyleDeclaration): Box | undefined {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return undefined;
  const width = Math.ceil(rect.width / SIZE_STEP) * SIZE_STEP;
  const height = Math.ceil(rect.height / SIZE_STEP) * SIZE_STEP;
  return {
    // Capped against the short side so a 56px pill keeps a core to stay still.
    band: Math.min(
      token(style, "--glass-refraction-band"),
      width / 3,
      height / 3,
    ),
    height,
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
    width,
  };
}

// Red carries x and blue carries y; the blurred neutral core leaves
// displacement only in the rim, so it reads as a lens, not a warped panel.
function mapUri({ band, height, radius, width }: Box): string {
  const grey = `rgb(${NEUTRAL},${NEUTRAL},${NEUTRAL})`;
  const svg =
    `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>` +
    `<linearGradient id="x" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="rgb(0,0,0)"/><stop offset="1" stop-color="rgb(255,0,0)"/>` +
    `</linearGradient>` +
    `<linearGradient id="y" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="rgb(0,0,0)"/><stop offset="1" stop-color="rgb(0,0,255)"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="${width}" height="${height}" fill="rgb(0,0,0)"/>` +
    `<rect width="${width}" height="${height}" fill="url(#x)" style="mix-blend-mode:screen"/>` +
    `<rect width="${width}" height="${height}" fill="url(#y)" style="mix-blend-mode:screen"/>` +
    `<rect x="${band}" y="${band}" width="${width - band * 2}" height="${height - band * 2}" ` +
    `rx="${Math.max(radius - band, 0)}" fill="${grey}" style="filter:blur(${band / 4}px)"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Drifting scales per channel, screened back together — the fringe real glass
// throws at an edge, rather than a clean shift.
function filterMarkup(id: string, { scale, softness, spread }: Optics): string {
  const passes = CHANNELS.map(
    (matrix, i) =>
      `<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" ` +
      `scale="${scale + spread * i}" result="d${i}"/>` +
      `<feColorMatrix in="d${i}" type="matrix" values="${matrix}" result="c${i}"/>`,
  ).join("");

  return (
    `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">` +
    `<feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>` +
    passes +
    `<feBlend in="c0" in2="c1" mode="screen" result="rg"/>` +
    `<feBlend in="rg" in2="c2" mode="screen" result="rgb"/>` +
    `<feGaussianBlur in="rgb" stdDeviation="${softness}"/>` +
    `</filter>`
  );
}

function sync(el: HTMLElement): void {
  const lens = lenses.get(el);
  if (!lens) return;
  const box = readBox(el, getComputedStyle(el));
  if (!box) return;
  const key = `${box.width}:${box.height}:${box.radius}:${box.band}`;
  if (lens.key === key) return;
  lens.key = key;
  lens.filter.querySelector("feImage")?.setAttribute("href", mapUri(box));
  // Held back until the map exists: an feImage with no href resolves to zeroes,
  // which shoves the whole backdrop by half the scale for a frame.
  el.style.setProperty("--glass-liquid-refraction", `url(#${lens.id})`);
}

function attach(el: HTMLElement): void {
  if (lenses.has(el) || !supported()) return;

  const root = defsRoot();
  const id = `cela-lens-${(seq += 1)}`;
  root.insertAdjacentHTML(
    "beforeend",
    filterMarkup(id, readOptics(getComputedStyle(el))),
  );
  const filter = root.lastElementChild as SVGFilterElement;

  const observer = new ResizeObserver(() => {
    const live = lenses.get(el);
    if (!live || live.frame) return;
    live.frame = requestAnimationFrame(() => {
      live.frame = undefined;
      sync(el);
    });
  });

  lenses.set(el, { filter, id, observer });
  sync(el);
  observer.observe(el);
}

function detach(el: HTMLElement): void {
  const lens = lenses.get(el);
  if (!lens) return;
  if (lens.frame) cancelAnimationFrame(lens.frame);
  lens.observer.disconnect();
  lens.filter.remove();
  lenses.delete(el);
  el.style.removeProperty("--glass-liquid-refraction");
}

export const vLiquidGlass: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    if (binding.value ?? true) attach(el);
  },
  unmounted(el) {
    detach(el);
  },
  updated(el, binding) {
    if (binding.value ?? true) attach(el);
    else detach(el);
  },
};
