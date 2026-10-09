import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { words } from "../lib/text.ts"

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets")

const CSS = `
  .t{font:600 12px ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial;fill:#1f2328}
  .s{font:10.5px ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial;fill:#656d76}
  .k{font:600 9px ui-sans-serif,sans-serif;fill:#7d4e00;letter-spacing:.07em}
  .b{fill:#ffffff;stroke:#d0d7de;stroke-width:1.5}
  .g{fill:#fff8c5;stroke:#9a6700;stroke-width:1.5}
  .a{fill:#fbefff;stroke:#8250df;stroke-width:1.5}
  .m{fill:#f6f8fa;stroke:#d0d7de;stroke-width:1.5}
  .ln{stroke:#8c959f;stroke-width:1.5;fill:none}
  .lp{stroke:#8c959f;stroke-width:1.3;fill:none;stroke-dasharray:4 3}
  .at{fill:#6639ba}
  @media (prefers-color-scheme: dark){
    .t{fill:#e6edf3}.s{fill:#9198a1}.k{fill:#e3b341}
    .b{fill:#151b23;stroke:#3d444d}
    .g{fill:#2b2412;stroke:#d4a72c}
    .a{fill:#231c33;stroke:#a371f7}
    .m{fill:#0d1117;stroke:#3d444d}
    .ln,.lp{stroke:#6e7681}
    .at{fill:#c297ff}
  }
`

const ARROW =
  '<defs><marker id="h" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" ' +
  'markerHeight="7" orient="auto-start-reverse">' +
  '<path d="M0 0 L10 5 L0 10 z" fill="#8c959f"/></marker></defs>'

// Halves print as 74.0 rather than 74, so the redrawn files stay byte for byte what the python drew.
const half = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n))
const escape = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

type Svg = { w: number; h: number; body: string[]; alt: string }

function svg({ w, h, body, alt }: Svg): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" ` +
    `height="${h}" role="img" aria-label="${escape(alt).replaceAll('"', "&quot;")}">\n` +
    `<style>${CSS}</style>\n${ARROW}\n${body.join("\n")}\n</svg>\n`
  )
}

function wrap(text: string, limit: number): string[] {
  const lines: string[] = []
  let cur = ""
  for (const word of words(text)) {
    const trial = `${cur} ${word}`.trim()
    if (trial.length > limit && cur) {
      lines.push(cur)
      cur = word
    } else cur = trial
  }
  if (cur) lines.push(cur)
  return lines
}

type Box = { x: number; y: number; w: number; h: number; title: string; kind?: string; note?: string }

function box({ x, y, w, h, title, kind = "b", note = "" }: Box): string {
  const out = [`<rect class="${kind}" x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/>`]
  const lines = wrap(title, 17)
  // Vertically centred as a block, so a two-line label does not sit low in its box.
  const top = y + h / 2 - (lines.length - 1) * 7 - (note ? 5 : 0) + 4
  lines.forEach((line, i) => out.push(`<text class="t" x="${half(x + w / 2)}" y="${half(top + i * 14)}" text-anchor="middle">${escape(line)}</text>`))
  if (note) out.push(`<text class="k" x="${half(x + w / 2)}" y="${y + h - 7}" text-anchor="middle">${escape(note)}</text>`)
  return out.join("")
}

type Flow = { steps: [label: string, gate: boolean][]; loops: [from: number, to: number, caption: string][]; alt: string }

function modeSvg({ steps, loops, alt }: Flow): string {
  const [bw, bh, gap, x0, y0, lane] = [138, 56, 26, 16, 46, 34]
  const body: string[] = []
  steps.forEach(([label, gate], i) => {
    const x = x0 + i * (bw + gap)
    body.push(box({ x, y: y0, w: bw, h: bh, title: label, kind: gate ? "g" : "b", note: gate ? "GATE" : "" }))
    if (i) body.push(`<path class="ln" d="M${x - gap} ${half(y0 + bh / 2)} H${x - 4}" marker-end="url(#h)"/>`)
  })
  // Widest edge outermost, so a shorter return never runs underneath a longer one.
  const widestFirst = [...loops].sort((a, b) => Math.abs(b[0] - b[1]) - Math.abs(a[0] - a[1]))
  widestFirst.forEach(([src, dst, caption], depth) => {
    const sx = x0 + src * (bw + gap) + bw / 2
    const dx = x0 + dst * (bw + gap) + bw / 2
    const by = y0 + bh + 30 + depth * lane
    body.push(`<path class="lp" d="M${half(sx)} ${y0 + bh} V${by} H${half(dx)} V${y0 + bh + 4}" marker-end="url(#h)"/>`)
    body.push(`<text class="s" x="${half((sx + dx) / 2)}" y="${by + 15}" text-anchor="middle">${escape(caption)}</text>`)
  })
  const w = x0 * 2 + steps.length * bw + (steps.length - 1) * gap
  return svg({ w, h: 150 + Math.max(0, loops.length - 1) * lane, body, alt })
}

type Change = { before: string; after: string; bullets: string[]; alt: string }

function styleSvg({ before, after, bullets, alt }: Change): string {
  const [bw, bh, y0, w] = [210, 74, 44, 620]
  const right = w - 20 - bw
  const body = [
    box({ x: 20, y: y0, w: bw, h: bh, title: before, kind: "m" }),
    box({ x: right, y: y0, w: bw, h: bh, title: after, kind: "a" }),
    `<path class="ln" d="M${20 + bw + 12} ${half(y0 + bh / 2)} H${right - 12}" marker-end="url(#h)"/>`,
    `<text class="s" x="${half(w / 2)}" y="${half(y0 + bh / 2 - 10)}" text-anchor="middle">the style</text>`,
    `<text class="s" x="20" y="${y0 - 14}">what it would have been</text>`,
    `<text class="s at" x="${right}" y="${y0 - 14}">what it becomes</text>`,
    ...bullets.map((line, i) => `<text class="s" x="20" y="${y0 + bh + 26 + i * 15}">${escape(line)}</text>`),
  ]
  return svg({ w, h: 76 + bh + bullets.length * 15, body, alt })
}

const MODES: Record<string, Flow> = {
  ic: {
    steps: [["Read the ask", false], ["Ground it", false], ["Build", false], ["Verify", false], ["Deliver", false]],
    loops: [[3, 2, "fails, so back to building"], [4, 0, "the next ask, read again"]],
    alt:
      "IC mode runs one loop: read the ask, ground it in the repo, build, verify through " +
      "something that can disagree, deliver. A failed verification returns to building, and " +
      "delivering returns to the read, because a session carries several asks.",
  },
  pair: {
    steps: [["Read and ground", false], ["Director and advisor", true], ["Build", false], ["Verify", false], ["Director sign-off", true], ["Deliver", false]],
    loops: [[3, 2, "fails, so back to building"], [4, 2, "changes asked, back to building"], [5, 0, "the next ask, read again"]],
    alt:
      "Pair mode reads and grounds the ask, then stops at a gate where the director weighs in " +
      "on what to build and the advisor on how. It builds, verifies, and stops at a second " +
      "gate where the director reads the work and signs off before anything is committed. A " +
      "failed verification or a change the director asks for returns to building, and " +
      "delivering returns to the read.",
  },
  copilot: {
    steps: [["Intake together", false], ["Spec artifact", false], ["Approval", true], ["Dispatch team", false], ["Integrate", false], ["Deliver", false]],
    loops: [[4, 3, "fails review, back to the owner"], [5, 0, "the next request, a new spec and a new yes"]],
    alt:
      "Copilot runs intake with the user, writes a spec artifact, then stops at an " +
      "approval gate. Only a recorded yes opens dispatch to a team, whose work is " +
      "verified and integrated. The next request returns to intake, never to dispatch, " +
      "because the recorded yes belongs to one slug.",
  },
  autopilot: {
    steps: [["Read the goal", false], ["Plan, privately", false], ["Dispatch team", false], ["Integrate", false], ["Open the MR", false]],
    loops: [[3, 2, "fails verification, back to the owner"]],
    alt:
      "Autopilot has no approval gate because nobody is present to give one. It reads " +
      "the goal, plans for itself, dispatches, integrates and opens the merge request, " +
      "which is also where it ends. Work that fails verification goes back to the " +
      "teammate that produced it.",
  },
  debug: {
    steps: [["Instrument", false], ["Reproduces", true], ["Fix the cause", false], ["Explainer", false], ["Approval", true], ["Open the MR", false]],
    loops: [[1, 0, "will not reproduce, so back to visibility"], [4, 3, "changes asked, back to the explainer"]],
    alt:
      "Debug makes the failure observable first, then holds at a gate until it reproduces " +
      "on demand. Only then does it fix the cause, write the explainer, take an approval " +
      "on it and open the merge request, which is where the mode ends.",
  },
  tdd: {
    steps: [["Enumerate cases", false], ["Reduce to minimum", false], ["Red", true], ["Green", false], ["Refactor", false]],
    loops: [[4, 2, "next behaviour needs a new red"]],
    alt:
      "TDD enumerates cases from structure, reduces them to a minimum set, then loops: a " +
      "test that fails on its assertion, the least code that passes it, then refactoring " +
      "while green. It is done when the minimum set is green.",
  },
  goal: {
    steps: [["Implement", false], ["Verify for real", false], ["Fresh audit", false]],
    loops: [[1, 0, "fails, back to the work"], [2, 0, "findings, fix them all"], [2, 1, "clean, so run both gates again"]],
    alt:
      "Goal loops until the outcome is truly reached: implement, verify through a channel " +
      "that can disagree, then hand the diff to a fresh subagent that audits it against the " +
      "project's own bar. Any fix restarts the loop, and done is two clean rounds in a row.",
  },
  tester: {
    steps: [["Environment", false], ["Enumerate surface", false], ["Generate cases", false], ["Execute for real", false], ["Verdict", false]],
    loops: [],
    alt:
      "Tester establishes the environment and preconditions, enumerates the surface by " +
      "reading rather than recall, generates cases from structure, runs them for real and " +
      "reports a verdict. It has no return edge because it fixes nothing.",
  },
  swarm: {
    steps: [["Triage the ask", true], ["Dispatch to an owner", false], ["Deliver", false], ["Retire the fleet", false]],
    loops: [[2, 0, "more work arrives, so triage it again"], [2, 1, "fails verification, back to the owner"]],
    alt:
      "Swarm triages every request that arrives, rejecting an unclear one rather than " +
      "routing it, and dispatches a clear one to the owner of those files or to one hired " +
      "for them. Once every owner has handed back it sits in delivered and waits. The next " +
      "ask goes round to triage again, and retiring the fleet is the only way out.",
  },
  dispatcher: {
    steps: [["Split the batch", true], ["Ground each request", false], ["Triage: new, relay or answer", false]],
    loops: [[2, 0, "more arrives, so split it again"]],
    alt:
      "Dispatcher splits a batch of requests and grounds each just far enough to triage it: a " +
      "new conversation for work nobody holds, a relay to the live session that holds it, or an " +
      "answer here when a look settles it. It never writes a file and delivers nothing itself.",
  },
  studio: {
    steps: [["Talk it through", false], ["Onto the page now", false], ["React to what is there", false], ["Widen or narrow", false]],
    loops: [[3, 0, "round again, rejected options stay visible"]],
    alt:
      "Studio is a cycle rather than a pipeline: talk, put it on the page immediately, " +
      "react to what is visible, widen or narrow, and go round again. Rejected options " +
      "stay on the page with their reasons.",
  },
}

const STYLES: Record<string, Change> = {
  edu: {
    before: "A lecture, glossary and recap",
    after: "A friend explaining it",
    bullets: [
      "Top down: the thing itself, an everyday comparison, then the detail.",
      "A new term explained in passing, a drawing where it has shape.",
      "Ends on the one thing to keep, said once, never a recap.",
    ],
    alt:
      "The edu style turns a lecture with a glossary and a recap into a friend explaining it, " +
      "top down, with a drawing where the thing has shape and one line worth keeping at the end.",
  },
  fast: {
    before: "Preamble, plan, work, recap",
    after: "The one thing, and done",
    bullets: [
      "No preamble, no plan, no recap. Two or three sentences is normal.",
      "Defaults taken and named in a handful of words.",
      "Fewer words, never less work: the lookup still happens.",
    ],
    alt:
      "The fast style strips preamble, plan and recap down to the one thing and a statement " +
      "that it is done, without skipping any of the actual work.",
  },
  ship: {
    before: "Code that works, alone",
    after: "Code the next person can hold",
    bullets: [
      "Readable, named for what it is, grouped by domain, typed at its edges.",
      "Tests, docs and the changelog move in the same diff as the code.",
      "The blast radius is named out loud; a stale dependency is reported, never bumped.",
    ],
    alt:
      "The ship style turns code that merely works into code the next developer can " +
      "maintain, arriving with its tests, docs and changelog in the same diff and the " +
      "blast radius of every behaviour change named.",
  },
  native: {
    before: "Your own idiom",
    after: "The idiom already in the file",
    bullets: [
      "Match the neighbours: naming, structure, test shape, commit style.",
      "Contribute none of your own conventions to somebody else's house.",
      "A local habit you dislike is still the local habit.",
    ],
    alt:
      "The native style drops your own conventions and matches the ones already in the " +
      "file, so a contribution to somebody else's repository reads as theirs.",
  },
  creative: {
    before: "The first safe answer",
    after: "Several real options, one bold",
    bullets: [
      "Genuinely different options, not one renamed three ways.",
      "The boldness is spent in one place, and its cost is named.",
      "Creativity is in the approach, never in the facts.",
    ],
    alt:
      "The creative style replaces the first safe answer with several genuinely " +
      "different options, spending boldness in one place and naming what it cost, while " +
      "leaving the facts untouched.",
  },
  xyz: {
    before: "Straight to the answer",
    after: "The read, then the answer",
    bullets: [
      "X what was typed, Y what was meant, Z what that forces into existence.",
      "Y is inferred from the repo and the history, not asked.",
      "A Z inside the topic gets done this turn and reported.",
    ],
    alt:
      "The xyz style opens every reply with a three line read, stating what was typed, what " +
      "was actually meant, and the adjacent work that follows, before doing anything.",
  },
}

function hookSequence(): string {
  const actors = ["You", "The hook", "bin/mode", "Claude"]
  const xs = [90, 250, 410, 570]
  const [top, bottom] = [54, 250]
  const body: string[] = []
  actors.forEach((name, i) => {
    const x = xs[i] ?? 0
    body.push(box({ x: x - 62, y: 20, w: 124, h: 30, title: name, kind: name === "Claude" ? "a" : "b" }))
    body.push(`<line class="lp" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"/>`)
  })
  const messages: [from: number, to: number, label: string, y: number][] = [
    [0, 1, "your message, before Claude sees it", 84],
    [1, 2, "expire, switch, choose", 122],
    [2, 1, "what each slot now holds", 160],
    [1, 3, "message plus the contract text", 198],
  ]
  for (const [from, to, label, y] of messages) {
    const [a = 0, b = 0] = [xs[from], xs[to]]
    body.push(`<path class="ln" d="M${a} ${y} H${b}" marker-end="url(#h)"/>`)
    body.push(`<text class="s" x="${half((a + b) / 2)}" y="${y - 6}" text-anchor="middle">${escape(label)}</text>`)
  }
  body.push(`<text class="s" x="${xs[3]}" y="${bottom + 20}" text-anchor="middle">holds by mechanism, not by remembering</text>`)
  return svg({
    w: 660,
    h: 285,
    body,
    alt:
      "The hook intercepts your message before Claude sees it, asks bin/mode to expire, " +
      "switch and choose, receives what each slot now holds, and passes Claude the message " +
      "together with the contract text.",
  })
}

function rulesTiers(): string {
  const body = [
    '<text class="s" x="20" y="30">A rules file with no when: pattern</text>',
    box({ x: 20, y: 40, w: 250, h: 52, title: "Always on", kind: "g", note: "EVERY CONVERSATION" }),
    '<text class="s" x="20" y="112">Injected whole on the first prompt, then never</text>',
    '<text class="s" x="20" y="127">repeated. Six ship this way.</text>',
    '<text class="s" x="330" y="30">A rules file carrying when:</text>',
    box({ x: 330, y: 40, w: 250, h: 52, title: "Waits for its trigger", kind: "a", note: "ONCE, WHEN MATCHED" }),
    '<text class="s" x="330" y="112">Stays out of the first prompt and costs nothing</text>',
    '<text class="s" x="330" y="127">until a message matches. The artifact rule.</text>',
    '<line class="lp" x1="20" y1="152" x2="580" y2="152"/>',
    box({ x: 20, y: 172, w: 170, h: 46, title: "Resume or compact", kind: "m" }),
    '<path class="ln" d="M196 195 H246" marker-end="url(#h)"/>',
    box({ x: 250, y: 172, w: 170, h: 46, title: "Re-armed", kind: "g" }),
    '<text class="s" x="436" y="190">Either one drops the injected</text>',
    '<text class="s" x="436" y="205">text, so the rules go again.</text>',
  ]
  return svg({
    w: 620,
    h: 240,
    body,
    alt:
      "A rules file with no when pattern is injected whole on the first prompt of every " +
      "conversation. A rules file carrying a when pattern waits and costs nothing until a " +
      "message matches it. A resume or a compact re-arms both, because either one drops " +
      "the injected text.",
  })
}

function slotLifecycle(): string {
  const nodes: [name: string, x: number, y: number][] = [["empty", 60, 60], ["held", 300, 30], ["auto", 300, 130], ["chosen", 520, 130]]
  const body = nodes.map(([name, x, y]) =>
    box({ x, y, w: 116, h: 44, title: name, kind: name === "chosen" ? "a" : "b", note: name === "chosen" ? "~ IN THE CHIP" : "" }),
  )
  const edges: [ax: number, ay: number, bx: number, by: number, label: string][] = [
    [176, 52, 300, 52, "you type a name"],
    [176, 92, 300, 152, "/mode auto"],
    [416, 152, 520, 152, "a pattern matches"],
    [520, 168, 416, 168, "its exit fires"],
  ]
  for (const [ax, ay, bx, by, label] of edges) {
    const mid = half((ax + bx) / 2)
    body.push(`<path class="ln" d="M${ax} ${ay} C${mid} ${ay} ${mid} ${by} ${bx} ${by}" marker-end="url(#h)"/>`)
    body.push(`<text class="s" x="${mid}" y="${Math.min(ay, by) - 7}" text-anchor="middle">${escape(label)}</text>`)
  }
  body.push(
    '<path class="lp" d="M358 74 V118" marker-end="url(#h)"/>',
    '<text class="s" x="366" y="100">off</text>',
    '<text class="s" x="20" y="212">A contract you typed is never overridden by a pattern. A message matching two picks neither.</text>',
    "<text class=\"s\" x=\"20\" y=\"230\">A pinned default is taken only by a contract that opts in, named in the prompt's opening sentence.</text>",
  )
  return svg({
    w: 660,
    h: 246,
    body,
    alt:
      "A slot moves between empty, held when you type a name, and auto. While on auto a " +
      "matching pattern moves it to chosen, marked with a tilde in the status line, and " +
      "its exit condition returns it to auto rather than to empty. A pinned default is " +
      "taken only by a contract that opts in, named in the prompt's opening sentence.",
  })
}

const drawings: [file: string, draw: () => string][] = [
  ["hook-sequence", hookSequence],
  ["rules-tiers", rulesTiers],
  ["slot-lifecycle", slotLifecycle],
  ...Object.entries(MODES).map(([name, flow]): [string, () => string] => [`mode-${name}`, () => modeSvg(flow)]),
  ...Object.entries(STYLES).map(([name, change]): [string, () => string] => [`style-${name}`, () => styleSvg(change)]),
]

mkdirSync(OUT, { recursive: true })
for (const [file, draw] of drawings) writeFileSync(join(OUT, `${file}.svg`), draw())
const written = drawings.map(([file]) => `${file}.svg`).sort()
console.log(`${written.length} written: ${written.join(", ")}`)
