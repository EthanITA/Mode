import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "mascot-source.svg");
const OUT = join(HERE, "..", "app", "components", "claude", "mascot.vue");

type Frame = { fill: string; visible: boolean; d: string };
type Layer = { index: number; fill: string; frames: Frame[] };

const LAYER = /<g transform="matrix\([^"]*\)" opacity="[^"]*" style="display: block;">([\s\S]*?)(?=<g transform="matrix\([^"]*\)" opacity="[^"]*" style="display: block;">|$)/g;
const PATH = /<path fill="(rgb\([^)]*\))" fill-opacity="([\d.]+)" d="([^"]*)"/g;

function layersOf(svg: string): Layer[] {
  const out: Layer[] = [];
  for (const [index, chunk] of [...svg.matchAll(LAYER)].map((m, i) => [i, m[1] ?? ""] as const)) {
    const frames: Frame[] = [];
    for (const hit of chunk.matchAll(PATH)) {
      frames.push({ fill: hit[1] ?? "", visible: Number(hit[2]) > 0, d: (hit[3] ?? "").trim() });
    }
    if (frames.length) out.push({ index, fill: frames[0]?.fill ?? "", frames });
  }
  return out;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

// Lottie writes every segment as a cubic with coincident controls, so the coordinate list is the outline.
function boxOf(d: string, box: Box): Box {
  const nums = d.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i] as number;
    const y = nums[i + 1] as number;
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  }
  return box;
}

const svg = readFileSync(SOURCE, "utf8");
const layers = layersOf(svg);

console.log(`layers: ${layers.length}`);
let box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
for (const layer of layers) {
  const shown = layer.frames.filter((f) => f.visible).length;
  console.log(`  layer ${layer.index}  fill ${layer.fill.padEnd(18)}  frames ${String(layer.frames.length).padStart(3)}  visible ${shown}`);
  for (const frame of layer.frames) box = boxOf(frame.d, box);
}

const pad = 0;
const vx = Math.floor(box.minX) - pad;
const vy = Math.floor(box.minY) - pad;
const vw = Math.ceil(box.maxX - box.minX) + pad * 2;
const vh = Math.ceil(box.maxY - box.minY) + pad * 2;
console.log(`\ncontent bounds: x ${box.minX}..${box.maxX}  y ${box.minY}..${box.maxY}`);
console.log(`cropped viewBox: "${vx} ${vy} ${vw} ${vh}"  (source canvas was 2750x1850)`);

// Only layers that actually draw become frame tracks; a wholly transparent layer is another state.
const drawn = layers.filter((layer) => layer.frames.some((f) => f.visible));
console.log(`\ndrawing layers: ${drawn.map((l) => l.index).join(", ") || "none"}`);
console.log(`hidden layers:  ${layers.filter((l) => !drawn.includes(l)).map((l) => l.index).join(", ") || "none"}`);

const tracks = layers.map((layer) => ({
  fill: layer.fill,
  frames: layer.frames.map((f) => f.d),
}));

const report = { viewBox: `${vx} ${vy} ${vw} ${vh}`, tracks };
writeFileSync(join(HERE, "mascot-frames.json"), JSON.stringify(report, null, 2));
console.log(`\nwrote tools/mascot-frames.json (${tracks.length} tracks, ${tracks.reduce((n, t) => n + t.frames.length, 0)} frames)`);
console.log(`component target: ${OUT}`);
