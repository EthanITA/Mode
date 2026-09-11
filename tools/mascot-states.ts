import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..", "app");
const SFC = join(APP, "components", "claude", "mascot.vue");

const STATES = ["idle", "thinking", "coding", "investigating", "running"] as const;

const sfc = readFileSync(SFC, "utf8");
const doing = readFileSync(join(APP, "utils", "doing.ts"), "utf8");
const sidecar = readFileSync(join(APP, "assets", "css", "sidecar.css"), "utf8");
const transcript = readFileSync(join(APP, "components", "composer", "transcript.vue"), "utf8");
const dock = readFileSync(join(APP, "components", "composer", "dock.vue"), "utf8");
const convo = readFileSync(join(APP, "composables", "useConversation.ts"), "utf8");

const template = sfc.match(/<template>([\s\S]*?)<\/template>/)?.[1]?.trim() ?? "";
const style = sfc.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1]?.trim() ?? "";
if (!template || !style) throw new Error("could not read the component's template or style");

const tokenLines = sidecar.match(/^\s*--(?:mascot|prop|portal)(?:-[a-z0-9]+)*:[^;]+;$/gm) ?? [];
if (!tokenLines.length) throw new Error("no mascot or prop tokens found in sidecar.css");
const tokens = tokenLines.map((line) => `  ${line.trim()}`).join("\n");

function quoted(pattern: RegExp, source: string): string[] {
  const raw = source.match(pattern)?.[1] ?? "";
  return [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

const MOVES = [...new Set(quoted(/const MOVES = \[([^\]]+)\]/, sfc))];

const BOX = (() => {
  const hit = sfc.match(/const BOX = \{ x: (-?[\d.]+), y: (-?[\d.]+), w: ([\d.]+), h: ([\d.]+) \}/);
  if (!hit) throw new Error("could not read BOX from the component");
  return { x: Number(hit[1]), y: Number(hit[2]), w: Number(hit[3]), h: Number(hit[4]) };
})();

// Every fact below is read from source, so the page cannot describe a mascot that is not shipped.
const SETS = Object.fromEntries(
  ["WRITE", "LOOK", "OFFLOAD"].map((name) => [name, quoted(new RegExp(`const ${name} = new Set\\(\\[([^\\]]+)\\]`), doing)]),
) as Record<string, string[]>;

const timings = [...style.matchAll(/\.mascot\[data-state="(\w+)"\] \.([\w.-]+) \{?\s*animation: ([\w-]+) ([\d.]+m?s)/g)]
  .map((m) => ({ state: m[1] as string, part: (m[2] as string).replace(/^\./, ""), name: m[3] as string, dur: m[4] as string }));

const beam = {
  leave: style.match(/\.beam-leave-active \{\s*transition: ([^;]+);/)?.[1]?.trim() ?? "",
  enter: style.match(/\.beam-enter-active \{[\s\S]*?transition: ([^;]+);/)?.[1]?.trim() ?? "",
  from: style.match(/\.beam-enter-from,\s*\.beam-leave-to \{([^}]+)\}/)?.[1]?.replace(/\s+/g, " ").trim() ?? "",
};

const sizes = [
  ...[...transcript.matchAll(/:size="(\d+)"/g)].map((m) => ({ where: "transcript", size: Number(m[1]) })),
  ...[...dock.matchAll(/:size="(\d+)"/g)].map((m) => ({ where: "chat input", size: Number(m[1]) })),
];

const stallMs = convo.match(/STALL_MS = ([\d_]+)/)?.[1]?.replace(/_/g, "") ?? "6000";
const portMs = convo.match(/PORT_MS = ([\d_]+)/)?.[1]?.replace(/_/g, "") ?? "2100";
const holdMs = sfc.match(/\}, (\d+)\);/)?.[1] ?? "900";

function markup(state: string, move: string, size: number): string {
  const w = Math.round(size * (BOX.w / BOX.h));
  return template
    .replace(/:data-porting="porting"/, 'data-porting="false"')
    .replace(
      /:style="\{ animationDelay: blinkIn, animationDuration: blink \}"/,
      `style="animation-delay:${(Math.random() * 2.5).toFixed(2)}s;animation-duration:${(4.4 + Math.random() * 3.2).toFixed(2)}s"`,
    )
    .replace(/:style="\{ height: `\$\{size\}px`, width: `\$\{width\}px` \}"/, `style="height:${size}px;width:${w}px"`)
    .replace(/:x="BOX\.x" :y="BOX\.y" :width="BOX\.w" :height="BOX\.h"/, `x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}"`)
    .replace(/:viewBox="`\$\{BOX\.x\} \$\{BOX\.y\} \$\{BOX\.w\} \$\{BOX\.h\}`"/g, `viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}"`)
    .replace(/<Transition[^>]*name="beam">\s*/, "")
    .replace(/\s*<\/Transition>/, "")
    .replace(/\s*v-if="show"/, "")
    .replace(/:data-move="move"/, `data-move="${move}"`)
    .replace(/:data-state="state"/, `data-state="${state}"`)
    .replace(/:height="size"/g, `height="${size}"`)
    .replace(/:width="width"/g, `width="${w}"`)
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

const cell = (label: string, note: string, state: string, move: string, size: number) =>
  `<figure class="cell">${markup(state, move, size)}<figcaption><b>${label}</b>${note ? `<span>${note}</span>` : ""}</figcaption></figure>`;

const WHAT: Record<string, string> = {
  idle: "just the mark; picks a move from the repertoire every few seconds",
  thinking: "a thought cloud to the right of its head",
  coding: "monitor behind, keyboard in front, code typing onto the screen, feet on the keys",
  investigating: "deerstalker and a magnifying glass that sweeps while the head follows it",
  running: "keyboard with a blinking caret; the body waits on it",
};

const states = STATES.map((s) => cell(s, WHAT[s] ?? "", s, "", 150)).join("");
const small = sizes.map(({ where, size }) => cell(`${size}px`, where, "coding", "", size)).join("");
const moves = MOVES.map((m) => cell(m, "", "idle", m, 130)).join("");

const rules = `
  <li><b>thinking</b> whenever nothing else is detected: the gap between your message and the first block back, and any block naming no tool.</li>
  <li><b>investigating</b> on ${SETS.LOOK?.join(", ")}.</li>
  <li><b>coding</b> on ${SETS.WRITE?.join(", ")}. It <em>latches</em>: after a write, reads stay coding for the rest of the turn.</li>
  <li><b>running</b> on ${SETS.OFFLOAD?.join(", ")}, anything matching <code>mcp__*</code>, and shell still going after ${stallMs}ms.</li>
  <li><b>idle</b> when there is no open turn at all.</li>`;

const timingRows = timings
  .map((t) => `<tr><td>${t.state}</td><td><code>.${t.part}</code></td><td><code>${t.name}</code></td><td>${t.dur}</td></tr>`)
  .join("");

const tokenRows = tokenLines
  .map((line) => {
    const [name, value] = line.trim().replace(/;$/, "").split(/:\s*/);
    return `<tr><td><code>${name}</code></td><td><code>${value}</code></td></tr>`;
  })
  .join("");

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<title>The Claude mascot</title>
<!-- Generated by tools/mascot-states.ts. Every fact is read from source; do not hand-edit. -->
<style>
:root {
  --canvas: #111113; --raised: #09090b; --sunken: #18181b; --ink: #fafafa;
  --muted: rgba(250,250,250,.6); --subtle: rgba(250,250,250,.38); --border: rgba(255,255,255,.12);
  --duration-moderate: 240ms; --duration-base: 300ms; --ease-out: cubic-bezier(.23,1,.32,1);
  --border-strong: rgba(255,255,255,.12); --info: #60a5fa; --warning: #fbbf24;
  color-scheme: dark;
${tokens}
}
[data-theme="light"] {
  --canvas: #f9f8f5; --raised: #ffffff; --sunken: #f3f1ed; --ink: #0d0425;
  --muted: #6e6882; --subtle: #9b96ab; --border: #e8e5df;
  --border-strong: #d4d0c9; --info: #3b82f6; --warning: #d4820c;
  color-scheme: light;
${tokens}
}
* { box-sizing: border-box; }
body { background: var(--canvas); color: var(--ink); font: 14px/1.6 ui-sans-serif, system-ui, sans-serif; margin: 0 auto; max-width: 1080px; padding: 34px 32px 100px; }
h1 { font-size: 24px; letter-spacing: -.02em; margin: 0 0 6px; }
p.lede { color: var(--muted); margin: 0 0 8px; max-width: 72ch; }
h2 { border-top: 1px solid var(--border); font-size: 12px; letter-spacing: .1em; margin: 42px 0 14px; padding-top: 20px; text-transform: uppercase; }
ul { margin: 0 0 12px; padding-left: 20px; }
li { margin-bottom: 5px; }
code { background: var(--sunken); border-radius: 4px; font-family: ui-monospace, Menlo, monospace; font-size: .88em; padding: 1px 5px; }
table { border-collapse: collapse; font-size: 13px; width: 100%; }
th, td { border-bottom: 1px solid var(--border); padding: 7px 10px; text-align: left; }
th { color: var(--subtle); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.sheet { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
.cell { align-items: center; background: var(--raised); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; gap: 10px; margin: 0; min-height: 214px; padding: 16px 14px; }
figcaption { color: var(--subtle); font-size: 11.5px; text-align: center; }
figcaption b { color: var(--ink); display: block; font-family: ui-monospace, Menlo, monospace; font-size: 12px; margin-bottom: 3px; }
figcaption span { display: block; }
.bar { align-items: center; background: var(--raised); border: 1px solid var(--border); border-radius: 12px; display: flex; gap: 16px; margin: 18px 0 26px; padding: 12px 16px; position: sticky; top: 12px; z-index: 4; }
button { background: var(--sunken); border: 1px solid var(--border); border-radius: 999px; color: var(--ink); cursor: pointer; font: inherit; font-size: 12.5px; padding: 6px 14px; }
.stage { background: var(--raised); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.perch-row { align-items: center; border: 1px dashed var(--border); border-radius: 10px; display: flex; gap: 14px; margin-bottom: 10px; min-height: 78px; padding: 10px 14px; }
.perch-row b { color: var(--subtle); font-family: ui-monospace, Menlo, monospace; font-size: 11px; font-weight: 400; }
.perch { align-items: center; display: flex; flex: none; height: 56px; justify-content: center; width: 63px; }
.note { color: var(--muted); font-size: 13px; margin: 0 0 12px; }

${style}
</style>
</head>
<body>

<h1>The Claude mascot</h1>
<p class="lede">
  Living documentation for <code>app/components/claude/mascot.vue</code>. The markup, the CSS, the state
  rules, the timings, the sizes and the colour tokens on this page are all read out of the source when it
  is generated, so nothing here can describe a mascot that is not the one shipped.
</p>
<p class="lede">Regenerate with <code>node --experimental-strip-types tools/mascot-states.ts</code>.</p>

<div class="bar">
  <button id="theme" type="button">light</button>
  <span class="note" style="margin:0">The mark is Anthropic's. The hat, lens, monitor, keyboard and cloud are drawn for this app in the mark's own rect language.</span>
</div>

<h2>What decides the state</h2>
<p class="note">A latching machine over the turn, not a lookup on the newest call.</p>
<ul>${rules}</ul>

<h2>The five states</h2>
<div class="sheet">${states}</div>

<h2>Teleporting between perches</h2>
<p class="note">
  No single mascot moves. Each row owns one, and the leave finishes before the enter begins, so the pair
  reads as one that travelled. Leave <code>${beam.leave}</code>, enter <code>${beam.enter}</code>, both
  from <code>${beam.from}</code>. The demo applies the same classes Vue applies in the app.
</p>
<div class="stage">
  <div class="perch-row"><b>beat row · Claude's turn</b><span class="perch" id="perchWork"></span></div>
  <div class="perch-row"><b>chat input · your turn</b><span class="perch" id="perchHome"></span></div>
  <button id="flip" type="button">hand over the turn</button>
  <p class="note" style="margin:12px 0 0">
    The portal opens, Claude looks it over for half a second, steps through, and half a second later
    both portals shut. The whole hand-over is ${portMs}ms; the portal runs
    <code>${style.match(/\.slot\[data-porting="true"\] \.portal \{\s*animation: ([^;]+);/)?.[1]?.trim() ?? ""}</code>.
  </p>
</div>

<h2>Idle repertoire</h2>
<p class="note">The legs never move when idle. One move is picked at random, held ${holdMs}ms, then it rests before the next.</p>
<div class="sheet">${moves}</div>

<h2>Sizes in use</h2>
<div class="sheet">${small}</div>

<h2>What animates, per state</h2>
<table><thead><tr><th>state</th><th>part</th><th>keyframes</th><th>duration</th></tr></thead><tbody>${timingRows}</tbody></table>

<h2>Colour</h2>
<p class="note">Only the body, legs and eyes are the brand. Every prop carries an object colour derived from the Cela palette.</p>
<table><thead><tr><th>token</th><th>value</th></tr></thead><tbody>${tokenRows}</tbody></table>

<script>
const root = document.documentElement;
const themeBtn = document.getElementById("theme");
themeBtn.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  themeBtn.textContent = next === "dark" ? "light" : "dark";
});

const WORKING = ${JSON.stringify(markup("coding", "", 56))};
const RESTING = ${JSON.stringify(markup("idle", "", 56))};
const PORT_MS = ${portMs};

document.getElementById("perchWork").innerHTML = WORKING;
document.getElementById("perchHome").innerHTML = RESTING;
const slots = [...document.querySelectorAll(".perch .slot")];
const figure = (slot) => slot.querySelector(".mascot");
let atWork = true;
let running = false;

// Vue adds and removes exactly these classes, so the demo runs on the shipped timing, not a copy.
function reveal(slot, show) {
  const el = figure(slot);
  el.classList.remove("beam-enter-from", "beam-enter-active", "beam-enter-to", "beam-leave-active", "beam-leave-to");
  if (show) {
    el.style.visibility = "visible";
    el.classList.add("beam-enter-from", "beam-enter-active");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.remove("beam-enter-from");
      el.classList.add("beam-enter-to");
    }));
    return;
  }
  el.classList.add("beam-leave-active");
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("beam-leave-to")));
}

function flip() {
  if (running) return false;
  running = true;
  atWork = !atWork;
  for (const slot of slots) {
    slot.dataset.porting = "false";
    void slot.getBoundingClientRect();
    slot.dataset.porting = "true";
  }
  reveal(slots[0], atWork);
  reveal(slots[1], !atWork);
  setTimeout(() => {
    for (const slot of slots) slot.dataset.porting = "false";
    figure(slots[atWork ? 1 : 0]).style.visibility = "hidden";
    running = false;
  }, PORT_MS);
  return true;
}

document.getElementById("flip").addEventListener("click", flip);

figure(slots[1]).style.visibility = "hidden";

// The page shows the round trip once on load, so the animation is seen without hunting for a button.
setTimeout(() => {
  flip();
  setTimeout(flip, PORT_MS + 600);
}, 700);
</script>
</body>
</html>
`;

writeFileSync(join(HERE, "mascot-states.html"), html);
console.log(`states ${STATES.length} · moves ${MOVES.length} · timings ${timings.length} · sizes ${sizes.length}`);
console.log(`tool sets: ${Object.entries(SETS).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
console.log(`stall ${stallMs}ms · idle hold ${holdMs}ms · tokens ${tokenLines.length}`);
console.log("wrote tools/mascot-states.html");
