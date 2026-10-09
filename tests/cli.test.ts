import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { after, before, describe, test } from "node:test"
import { declaring } from "../lib/hook/declares.ts"
import { announce } from "../lib/mode/announce.ts"
import { list, show, version } from "../lib/mode/catalogue.ts"
import { CHIP_ICON } from "../lib/mode/constants.ts"
import { deliverableCommand, deliverablesReport } from "../lib/mode/deliverable.ts"
import { pin, pinsReport } from "../lib/mode/pins.ts"
import { stepReport } from "../lib/mode/pipeline.ts"
import { Refusal } from "../lib/mode/refusal.ts"
import { rulesDue } from "../lib/mode/rules.ts"
import { adopt, approve, chips, choose, clear, done, getSlot, red, setSlot, standing } from "../lib/mode/slots.ts"
import { sync } from "../lib/mode/sync.ts"
import { triage, triageReport } from "../lib/mode/triage.ts"
import { whyReport } from "../lib/mode/why.ts"
import { contract, crashed, env, fixtureRoot, MODE, PLUGIN, run, scratch, write, type Contracts } from "./support.ts"

const LEAD = `---
name: lead
summary: Lead the topic and delegate every domain
color: magenta
no-implement: true
no-dispatch-without-approval: true
exit-when: manual
---

Decompose the topic, then hand each domain to a teammate.

Nothing in this paragraph belongs to the standing block.

## Standing reminder

You lead. You do not implement.
Every domain goes to a teammate.

## After the reminder

Never part of the standing block.
`

const BUGFIX = `---
name: bugfix
summary: Chase the fault to its cause
color: yellow
enter-when: not working|it fails|fail
exit-when: approved
---

Reproduce it before touching anything.

## Standing reminder

Reproduce first. Diagnose second. Fix last.
`

const SHIPPER = `---
name: shipper
summary: Get the branch merged
color: green
enter-when: ship it|open the mr
exit-when: mr-opened
---

Open the merge request.

## Standing reminder

The branch is not done until the merge request is open.
`

const HUSH = `---
name: hush
summary: Only ever entered by hand
color: grey
enter-when: hush now
enter-never: true
exit-when: manual
---

Say nothing unasked.

## Standing reminder

Speak only when spoken to.
`

const CLASH = `---
name: clash
summary: Answers to the same phrase as bugfix
color: red
enter-when: it fails
exit-when: manual
---

Two contracts, one phrase, no winner.

## Standing reminder

Nobody should ever be reading this.
`

const MAKER = `---
name: maker
summary: Build the thing that was asked for
color: blue
enter-when: build the
exit-when: manual
---

Build it.

## Standing reminder

Build what was asked for and stop there.
`

const RUNNER = `---
name: runner
summary: Carries a pipeline, so step has something to walk
color: green
exit-when: manual
steps: read, check?@question, build@artifact, verify@test, deliver@commit
loops: verify>build
---

Walk the steps.

## Standing reminder

One step at a time.
`

// A key the tool does not know, and two flags written in the shapes that must count as on.
const FUTURE = `---
name: future
summary: Carries keys a later release will add
color: cyan
requires: red-test
enter-when: refactor everything
enter-never: True
no-implement: yes
exit-when: manual
---

A contract from a release that has not happened.

## Standing reminder

Ignore the keys you do not know.
`

const TEACH = `---
name: teach
summary: Explain the mental model before the change
color: cyan
exit-when: manual
---

Teach the thing rather than only doing it.

## Standing reminder

Explain the model to {{USER}} before the change.
Name the trade-off, then recommend one.
`

const BRISK = `---
name: brisk
summary: Answer and stop
color: blue
enter-when: just the answer|be brief
exit-when: manual
---

Short sentences. No preamble.

## Standing reminder

Answer first. Cut every recap.
`

const FORMAL = `---
name: formal
summary: Write it the way a stranger will read it
color: grey
exit-when: manual
---

Full sentences, no shorthand.

## Standing reminder

Write for a reader who was not here.
`

const MANUAL = `---
name: mode
description: Hold a mode and a style. Modes available: stale, names. Styles available: stale, names.
---

<!-- modes:start -->
old junk
<!-- modes:end -->

<!-- styles:start -->
old junk
<!-- styles:end -->
`

const MODES: Contracts = { lead: LEAD, bugfix: BUGFIX, shipper: SHIPPER, hush: HUSH, clash: CLASH, maker: MAKER, future: FUTURE, runner: RUNNER }
const STYLES: Contracts = { teach: TEACH, brisk: BRISK, formal: FORMAL }
const CLEAN: Contracts = { maker: MAKER, shipper: SHIPPER }

const tmp = scratch("mode-cli-")
const config = join(tmp, "config")
const root = fixtureRoot(join(tmp, "plugin"), { modes: MODES, styles: STYLES, manual: MANUAL })
process.env.CLAUDE_CONFIG_DIR = config
process.env.MODE_PLUGIN_ROOT = root

// Session state keys on the first eight characters, so every id here differs inside them.
let count = 0
const sid = (): string => `s${String(++count).padStart(7, "0")}`

type Axis = "mode" | "style"
const set = (axis: Axis, session: string, name: string, chosen = false): string => setSlot({ axis, session, name, chosen })
const get = (axis: Axis, session: string): string => getSlot({ axis, session })
const chip = (axis: Axis, session: string): string[] => getSlot({ axis, session, chip: true }).split("\t")
const record = (session: string, reason: string): string => done({ axis: "mode", session, reason })

function refuses(action: () => unknown, code: number): Refusal {
  try {
    action()
  } catch (error) {
    if (error instanceof Refusal && error.code === code) return error
    throw error
  }
  assert.fail(`expected a refusal with code ${code}`)
}

// For a describe that reads a different plugin tree or config dir, put back what the rest of the file expects after it.
function within({ plugin = root, home = config, vars = {} }: { plugin?: string; home?: string; vars?: Record<string, string> }): void {
  const saved = { ...process.env }
  before(() => Object.assign(process.env, { MODE_PLUGIN_ROOT: plugin, CLAUDE_CONFIG_DIR: home, ...vars }))
  after(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
  })
}

const cli = (args: string[], vars: Record<string, string> = {}) => run(MODE, args, { env: env({ MODE_PLUGIN_ROOT: root, CLAUDE_CONFIG_DIR: config, ...vars }) })

describe("the command line", () => {
  test("answers to both axis words, confirming in one line", () => {
    const session = sid()
    const [mode, style] = [cli(["mode", "set", "lead", "--session", session]), cli(["style", "set", "teach", "--session", session])]
    assert.deepEqual([mode.status, mode.stdout, style.status, style.stdout], [0, "mode set to lead\n", 0, "style set to teach\n"])
  })

  test("exits 2 for an unknown name and 1 for a deliberate nothing, so a caller can tell a typo from an empty answer", () => {
    assert.equal(cli(["mode", "set", "nonesuch", "--session", sid()]).status, 2)
    const nothing = cli(["approve", "--session", sid()])
    assert.deepEqual([nothing.status, nothing.stdout], [1, ""])
  })

  test("chips exits 0 whatever it is handed, since a failing status line blanks the whole line", () => {
    for (const args of [["chips", "--colour"], ["chips", "--session"], ["chips"], ["chips", "--width", "40"]]) {
      const done = cli(args)
      assert.ok(done.status === 0 && !crashed(done), `${args.join(" ")}: ${done.stderr}`)
    }
  })

  test("no verb crashes on a plugin tree with no contracts", () => {
    const bare = fixtureRoot(join(tmp, "bare"), {})
    const verbs = [["mode", "list"], ["mode", "get"], ["mode", "get", "--chip"], ["chips"], ["standing"], ["mode", "show"], ["choose", "--axis", "mode", "--message", "hello"], ["pins"], ["why"], ["red"], ["adopt"], ["mode", "pin"]]
    for (const args of verbs) {
      const done = run(MODE, [...args, "--session", "s-bare"], { env: env({ MODE_PLUGIN_ROOT: bare, CLAUDE_CONFIG_DIR: config }) })
      assert.ok(!crashed(done), `${args.join(" ")}: ${done.stderr}`)
    }
    const typo = run(MODE, ["mode", "set", "lead", "--session", "s-bare"], { env: env({ MODE_PLUGIN_ROOT: bare, CLAUDE_CONFIG_DIR: config }) })
    assert.ok(typo.status !== 0 && !crashed(typo), typo.stderr)
  })
})

describe("set and get", () => {
  test("each axis round-trips what it was set to, and a clear slot reads empty", () => {
    const session = sid()
    set("mode", session, "lead")
    set("style", session, "teach")
    assert.deepEqual([get("mode", session), get("style", session), get("mode", sid())], ["lead", "teach", ""])
  })

  test("an unknown name, or a name from the other axis, is refused with 2 and leaves the held one standing", () => {
    const session = sid()
    set("mode", session, "lead")
    set("style", session, "teach")
    for (const [axis, name] of [["mode", "nonesuch"], ["style", "nonesuch"], ["style", "lead"], ["mode", "teach"]] as const) refuses(() => set(axis, session, name), 2)
    assert.deepEqual([get("mode", session), get("style", session)], ["lead", "teach"])
  })

  test("auto needs no contract file, and off empties the slot", () => {
    const session = sid()
    assert.equal(set("mode", session, "auto"), "mode set to auto")
    set("style", session, "auto")
    assert.deepEqual([get("mode", session), get("style", session)], ["auto", "auto"])
    set("mode", session, "off")
    assert.equal(get("mode", session), "")
  })

  test("changing or clearing one slot leaves the other exactly as it was", () => {
    const session = sid()
    set("mode", session, "lead")
    set("style", session, "teach")
    set("style", session, "brisk")
    assert.equal(get("mode", session), "lead")
    set("mode", session, "auto")
    assert.equal(get("style", session), "brisk")
    set("mode", session, "off")
    assert.equal(get("style", session), "brisk")
    set("mode", session, "maker")
    set("style", session, "off")
    assert.equal(get("mode", session), "maker")
  })

  test("two conversations hold two pairs at once, and an explicit session beats the environment's", () => {
    const [one, two] = [sid(), sid()]
    set("mode", one, "maker")
    set("style", one, "brisk")
    set("mode", two, "shipper")
    set("style", two, "formal")
    process.env.CLAUDE_CODE_SESSION_ID = two
    try {
      assert.deepEqual([get("mode", one), get("style", one), get("mode", two), get("style", two)], ["maker", "brisk", "shipper", "formal"])
    } finally {
      delete process.env.CLAUDE_CODE_SESSION_ID
    }
  })
})

describe("the chip, which the status line splits on tabs", () => {
  test("is always three fields: the name, its ANSI colour, and how the slot was reached", () => {
    const session = sid()
    assert.equal(chip("mode", session).length, 3)
    set("mode", session, "lead")
    set("style", session, "teach")
    assert.deepEqual([chip("mode", session), chip("style", session)], [["lead", "35", ""], ["teach", "36", ""]])
    set("mode", session, "hush")
    assert.match(chip("mode", session)[1] ?? "", /^\d+$/)
  })

  test("a value a pattern chose is marked chosen, on its own axis, until somebody types it", () => {
    const session = sid()
    assert.equal(set("mode", session, "bugfix", true), "mode set to bugfix")
    assert.deepEqual(chip("mode", session), ["bugfix", "33", "chosen"])
    set("style", session, "brisk", true)
    set("mode", session, "bugfix")
    assert.deepEqual([chip("mode", session)[2], chip("style", session)[2]], ["", "chosen"])
  })
})

describe("chips, which a status line drops in whole", () => {
  test("both icons render wide, so the line after them stays aligned", () => {
    assert.ok([CHIP_ICON.mode, CHIP_ICON.style].every((icon) => /^\p{Emoji_Presentation}$/u.test(icon)))
  })

  test("an empty slot reads off, each held one in its own colour, two spaces apart", () => {
    const session = sid()
    assert.equal(chips(session), "\u{1F9ED} off  \u{1F4AC} off")
    set("mode", session, "lead")
    const half = chips(session)
    assert.ok(half.includes("lead") && half.includes("  \u{1F4AC} off") && !half.includes("   "), half)
    set("style", session, "teach")
    assert.ok(chips(session).includes("\x1b[35m") && chips(session).includes("\x1b[36m"))
    set("mode", session, "bugfix", true)
    assert.match(chips(session), /~bugfix/)
  })
})

describe("choose, and the restraints on it", () => {
  test("a message matching one enter-when names it, in any case, and a message matching none names nothing", () => {
    const session = sid()
    set("mode", session, "auto")
    const picks = ["the deploy is not working", "the deploy is NOT WORKING again", "nothing in particular today"].map((message) => choose({ axis: "mode", session, message }))
    assert.deepEqual(picks, ["bugfix", "bugfix", ""])
  })

  test("only a slot on auto is chosen for: a typed value and an empty slot are left alone", () => {
    const [typed, empty] = [sid(), sid()]
    set("mode", typed, "lead")
    set("mode", empty, "off")
    for (const session of [typed, empty]) assert.equal(choose({ axis: "mode", session, message: "the deploy is not working" }), "")
    assert.equal(get("mode", typed), "lead")
  })

  test("two contracts answering one message choose neither, and the slot stays on auto", () => {
    const session = sid()
    set("mode", session, "auto")
    assert.equal(choose({ axis: "mode", session, message: "it fails on every load" }), "")
    assert.equal(get("mode", session), "auto")
  })

  test("enter-never beats a pattern that matches alone, and no enter-when never matches", () => {
    const session = sid()
    set("mode", session, "auto")
    assert.equal(choose({ axis: "mode", session, message: "hush now, I am on a call" }), "")
    assert.equal(choose({ axis: "mode", session, message: "explain the mental model first" }), "")
  })

  test("a phrase is anchored at the start of a word and free at the end", () => {
    const session = sid()
    set("mode", session, "auto")
    const table = [["rebuild the index from scratch", ""], ["build the storybook gallery", "maker"], ["a failure in the parser", "bugfix"], ["the tests keep failing", "bugfix"], ["it is still not working", "bugfix"]]
    assert.deepEqual(table.map(([message = ""]) => [message, choose({ axis: "mode", session, message })]), table)
  })

  test("each axis is matched against its own folder only", () => {
    const session = sid()
    set("style", session, "auto")
    set("mode", session, "auto")
    assert.equal(choose({ axis: "style", session, message: "just the answer please" }), "brisk")
    assert.equal(choose({ axis: "mode", session, message: "just the answer please" }), "")
    assert.equal(choose({ axis: "style", session, message: "the deploy is not working" }), "")
  })
})

describe("every spelling of a boolean flag", () => {
  const ON = ["true", "True", "TRUE", '"true"', "yes", "on", "y", "1", "maybe", "banana"]
  const OFF = ["false", "False", "FALSE", '"false"', "no", "No", "off", "n", "0", "", "   ", undefined]
  const spellings = [...ON, ...OFF]
  const stem = (i: number): string => `flag${String(i).padStart(2, "0")}`
  const flagroot = fixtureRoot(join(tmp, "flagroot"), {
    styles: { brisk: BRISK },
    modes: Object.fromEntries(
      spellings.map((value, i) => {
        const keys = typeof value === "string" ? `enter-never: ${value}\nno-dispatch-without-approval: ${value}\n` : ""
        return [stem(i), contract({ name: stem(i), keys: `enter-when: trigger${String(i).padStart(2, "0")}\n${keys}` })]
      }),
    ),
  })
  within({ plugin: flagroot })

  test("reads on when present and not an explicit no, the same through the chooser and through the gate's reader", () => {
    const misread = spellings.flatMap((value, i) => {
      const [chooser, gate] = [sid(), sid()]
      set("mode", chooser, "auto")
      const withheld = choose({ axis: "mode", session: chooser, message: `trigger${String(i).padStart(2, "0")} please` }) === ""
      set("mode", gate, stem(i))
      const denied = declaring(gate, "no-dispatch-without-approval") === stem(i)
      const armed = i < ON.length
      return withheld === armed && denied === armed ? [] : [`${JSON.stringify(value)}: chooser ${withheld}, gate ${denied}`]
    })
    assert.deepEqual(misread, [])
  })
})

describe("standing, which a hook injects every turn", () => {
  test("prints the mode's block then the style's, at most eight lines, stopping at the next heading", () => {
    const session = sid()
    set("mode", session, "lead")
    set("style", session, "teach")
    const body = standing(session)
    assert.ok(body.indexOf("You lead.") >= 0 && body.indexOf("You lead.") < body.indexOf("Name the trade-off"), body)
    assert.ok(body.split("\n").filter((line) => line.trim()).length <= 8)
    assert.ok(!body.includes("{{") && body.includes("before the change"), body)
    assert.ok(!body.includes("Never part of the standing block") && !body.includes("Decompose the topic"), body)
  })

  test("either slot alone prints its own block, and nothing held prints nothing", () => {
    const [mode, style] = [sid(), sid()]
    set("mode", mode, "lead")
    set("style", style, "brisk")
    assert.ok(standing(mode).includes("You lead.") && !standing(mode).includes("Name the trade-off"))
    assert.ok(standing(style).includes("Answer first.") && !standing(style).includes("You lead."))
    assert.equal(standing(sid()), "")
  })
})

describe("list and show", () => {
  test("list reads one folder per axis with summaries, and marks the held contract once", () => {
    const session = sid()
    set("mode", session, "maker")
    const modes = list({ axis: "mode", session })
    assert.ok(Object.keys(MODES).every((name) => modes.includes(name)) && modes.includes("Build the thing that was asked for"))
    assert.ok(!Object.keys(STYLES).some((name) => modes.includes(name)))
    assert.deepEqual(modes.split("\n").filter((line) => line.trimStart().startsWith("*")).length, 1)
    const styles = list({ axis: "style", session })
    assert.ok(Object.keys(STYLES).every((name) => styles.includes(name)) && !styles.includes("lead"))
    assert.ok(list({ session }).includes("maker") && list({ session }).includes("brisk"))
  })

  test("--tsv is one even row per contract, with the name, the summary and the held mark as whole fields", () => {
    const session = sid()
    set("mode", session, "maker")
    const rows = list({ axis: "mode", tsv: true, session }).split("\n").map((row) => row.split("\t"))
    assert.equal(rows.length, Object.keys(MODES).length)
    assert.ok(rows.every((row) => row.length === rows[0]?.length))
    assert.deepEqual(rows.filter((row) => row.at(-1)).map((row) => row.slice(1, 3)), [["maker", "Build the thing that was asked for"]])
  })

  test("show prints the held body, or its front matter, on the axis asked for", () => {
    const session = sid()
    set("mode", session, "lead")
    set("style", session, "formal")
    const body = show({ target: "mode", session })
    assert.ok(body.includes("Decompose the topic") && !body.includes("summary:"))
    assert.deepEqual(["name", "summary", "no-implement"].filter((key) => !show({ target: "mode", meta: true, session }).includes(`${key}:`)), [])
    assert.ok(show({ target: "style", session }).includes("Full sentences"))
    refuses(() => show({ target: "mode", session: sid() }), 1)
  })

  test("show takes a contract name too, and an unknown one is refused with 2, listing what exists", () => {
    assert.match(show({ target: "maker", meta: true, session: sid() }), /name: maker/)
    assert.match(refuses(() => show({ target: "nonesuch", meta: true }), 2).message, /maker/)
  })

  test("a key the tool does not know still parses and never becomes a contract of its own", () => {
    const session = sid()
    set("mode", session, "future")
    assert.match(show({ target: "mode", session }), /release that has not happened/)
    assert.ok(!list({ axis: "mode" }).includes("requires"))
  })
})

describe("announce, the whole contract once, then the reminder", () => {
  test("the turn a contract is entered carries all of it, later turns its reminder, and a switch earns it again", () => {
    const session = sid()
    set("mode", session, "lead")
    const first = announce({ session })
    assert.ok(first.includes("Decompose the topic") && first.includes("After the reminder"))
    const second = announce({ session })
    assert.ok(!second.includes("Decompose the topic") && second.includes("You lead."))
    set("mode", session, "maker")
    assert.ok(announce({ session }).includes("Build it."))
  })

  test("clear --announced re-arms it and leaves both slots alone", () => {
    const session = sid()
    set("mode", session, "maker")
    announce({ session })
    clear({ session, announced: true })
    assert.equal(get("mode", session), "maker")
    assert.ok(announce({ session }).includes("Build it."))
  })

  test("a style is announced too, and nothing held announces nothing", () => {
    const session = sid()
    set("style", session, "teach")
    assert.match(announce({ session }), /Teach the thing/)
    assert.equal(announce({ session: sid() }).trim(), "")
  })
})

describe("approve, whose answer is the dispatch gate's whole signal", () => {
  test("is recorded per conversation, the later slug winning", () => {
    const [session, other] = [sid(), sid()]
    set("mode", session, "lead")
    assert.equal(approve({ session }), undefined)
    approve({ slug: "first-slug", session })
    approve({ slug: "trade-brief", session })
    assert.deepEqual([approve({ session }), approve({ session: other })], ["trade-brief", undefined])
  })

  test("is scoped to the mode it was given under, hidden rather than consumed by a switch", () => {
    const session = sid()
    set("mode", session, "lead")
    approve({ slug: "trade-brief", session })
    set("mode", session, "maker")
    assert.equal(approve({ session }), undefined)
    set("mode", session, "lead")
    assert.equal(approve({ session }), "trade-brief")
  })

  test("--any-mode widens which mode counts, never whether a yes is needed", () => {
    const session = sid()
    set("mode", session, "lead")
    approve({ slug: "trade-brief", session })
    set("mode", session, "maker")
    assert.deepEqual([approve({ anyMode: true, session }), approve({ session }), approve({ anyMode: true, session: sid() })], ["trade-brief", undefined, undefined])
  })

  test("clear empties both slots and the approval, and clearing twice is harmless", () => {
    const session = sid()
    set("mode", session, "lead")
    set("style", session, "teach")
    approve({ slug: "x", session })
    clear({ session })
    clear({ session })
    assert.deepEqual([get("mode", session), get("style", session), approve({ session })], ["", "", undefined])
  })
})

describe("pins, which outlive a conversation", () => {
  const tree = (...parts: string[]): string => {
    const path = join(tmp, "trees", ...parts)
    mkdirSync(path, { recursive: true })
    return path
  }
  const read = (axis: Axis, path: string): string | undefined => pin({ axis, path })
  const plain = tree("plain")
  const repo = tree("repo")
  const deep = tree("repo", "packages", "api")

  test("a directory nothing pins says so for both axes", () => {
    assert.equal(pinsReport(plain).match(/nothing pinned/g)?.length, 2)
  })

  test("a personal pin names its contract and folder, and reaches every child but no sibling", () => {
    const said = pin({ axis: "mode", name: "maker", path: repo }) ?? ""
    assert.ok(said.includes("maker") && said.includes(repo), said)
    assert.deepEqual([read("mode", deep), read("mode", plain)], ["maker", undefined])
  })

  test("a committed .mode file pins with nobody running the tool, below a personal pin and above a shallower file", () => {
    write(join(repo, ".mode"), "mode: shipper\nstyle: formal  # the repo's own default\n")
    assert.deepEqual([read("style", deep), read("mode", deep)], ["formal", "maker"])
    assert.ok(pinsReport(deep).includes("personal") && pinsReport(deep).includes(".mode"))
    write(join(deep, ".mode"), "mode: bugfix\n")
    assert.equal(read("mode", deep), "bugfix")
    rmSync(join(deep, ".mode"))
  })

  test("a shared file naming a contract this machine lacks is stepped over, not the rest of the file", () => {
    write(join(deep, ".mode"), "mode: nosuchmode\nstyle: formal\n")
    assert.deepEqual([read("style", deep), read("mode", deep)], ["formal", "maker"])
    rmSync(join(deep, ".mode"))
  })

  test("a personal off masks a shared file, and forgetting it lets the shared one through again", () => {
    const masked = tree("masked")
    write(join(masked, ".mode"), "style: formal\n")
    pin({ axis: "style", name: "off", path: masked })
    assert.ok(!read("style", masked) && pinsReport(masked).includes("off"))
    pin({ axis: "style", forget: true, path: masked })
    assert.equal(read("style", masked), "formal")
  })

  test("an unknown name is refused with 2, while auto is pinnable", () => {
    refuses(() => pin({ axis: "mode", name: "nonesuch", path: repo }), 2)
    pin({ axis: "style", name: "auto", path: tree("autopin") })
    assert.equal(read("style", tree("autopin")), "auto")
  })

  test("adopt fills untouched slots once, marking them pinned, with = on the chip", () => {
    const session = sid()
    const said = adopt({ path: deep, session }) ?? ""
    assert.ok(["maker", "formal", "personal", "shared"].every((word) => said.includes(word)), said)
    assert.deepEqual(chip("mode", session), ["maker", "34", "pinned"])
    assert.ok(chips(session).includes("=maker") && !chips(session).includes("~"))
    assert.equal(adopt({ path: deep, session }), undefined)
    assert.equal(adopt({ path: plain, session: sid() }), undefined)
  })

  test("a slot typed into, or typed off, is never adopted over, and a name typed after drops the mark", () => {
    const [typed, off] = [sid(), sid()]
    set("mode", typed, "lead")
    set("mode", off, "off")
    adopt({ path: deep, session: typed })
    adopt({ path: deep, session: off })
    assert.deepEqual([chip("mode", typed), get("mode", off), get("style", off)], [["lead", "35", ""], "", "formal"])
    set("mode", off, "bugfix")
    assert.deepEqual(chip("mode", off), ["bugfix", "33", ""])
  })
})

describe("red and step, where order decides", () => {
  test("a watched failure stands until a pass after it, under the mode it was recorded in", () => {
    const session = sid()
    set("mode", session, "maker")
    const after = (reason: string) => (record(session, reason), red(session))
    assert.deepEqual([red(session), after("test-fail"), after("test"), after("test-fail"), after("commit")], [undefined, "test-fail", undefined, "test-fail", "test-fail"])
    set("mode", session, "shipper")
    assert.equal(red(session), undefined)
  })

  const where = (session: string): string => {
    const rows = (stepReport("mode", session, true) ?? "").split("\n").map((row) => row.split("\t"))
    return rows.find((row) => row[0] === "step" && row[3] === "here")?.[1] ?? "complete"
  }

  test("an event cannot reach past the steps before it, and lands once they have happened", () => {
    const session = sid()
    assert.equal(stepReport("mode", session, false), undefined)
    set("mode", session, "runner")
    record(session, "read")
    record(session, "commit")
    assert.equal(where(session), "check")
    record(session, "artifact")
    record(session, "test")
    assert.equal(where(session), "complete")
  })

  test("a gated step ahead of an event never blocks it, and a label recorded by name jumps", () => {
    const [gated, named] = [sid(), sid()]
    set("mode", gated, "runner")
    record(gated, "artifact")
    set("mode", named, "runner")
    record(named, "deliver")
    assert.deepEqual([where(gated), where(named)], ["verify", "complete"])
  })
})

describe("why, the report on what is steering the turn", () => {
  test("names both slots and how each was reached, and a declared gate shut until its approval lands", () => {
    const session = sid()
    set("mode", session, "lead")
    set("style", session, "teach")
    const body = whyReport({ session })
    assert.ok(["Slots", "Gates", "Ground rules", "The next prompt carries"].every((heading) => body.includes(heading)), body)
    assert.equal(body.match(/typed/g)?.length, 2)
    assert.ok(body.includes("no-dispatch-without-approval") && body.includes("SHUT"), body)
    approve({ slug: "the-spec", session })
    assert.match(whyReport({ session }), /the-spec/)
  })

  test("says whether the next prompt carries the whole contract or its reminder", () => {
    const session = sid()
    set("mode", session, "lead")
    assert.match(whyReport({ session }), /the whole lead contract/)
    announce({ session })
    assert.match(whyReport({ session }), /standing reminder of lead/)
  })

  test("answers with nothing held, and counts what auto has on offer", () => {
    const [empty, auto] = [sid(), sid()]
    set("mode", auto, "auto")
    assert.ok(whyReport({ session: empty }).includes("neither slot"))
    assert.match(whyReport({ session: auto }), /on offer/)
  })
})

describe("sync", () => {
  const syncroot = fixtureRoot(join(tmp, "syncroot"), { modes: CLEAN, styles: { brisk: BRISK }, manual: MANUAL })
  within({ plugin: syncroot })

  test("rewrites the registry and writes a shortcut per contract, silently", () => {
    const warnings: string[] = []
    sync((line) => warnings.push(line))
    const registry = readFileSync(join(syncroot, "skills", "mode", "MANUAL.md"), "utf8")
    assert.deepEqual(warnings, [])
    assert.ok(registry.includes("maker") && registry.includes("brisk") && !registry.includes("old junk"), registry)
    assert.ok(existsSync(join(syncroot, "commands", "maker.md")) && existsSync(join(config, "commands", "style:brisk.md")))
  })

  test("sweeps a stale generated shortcut and keeps a hand-written one", () => {
    const gone = write(join(config, "commands", "style:gone.md"), "A hook read this message and set the style slot to `gone`.\n")
    const mine = write(join(config, "commands", "style:mine.md"), "my own command, hands off\n")
    sync(() => {})
    assert.deepEqual([existsSync(gone), existsSync(mine)], [false, true])
  })
})

describe("sync over a non-canonical flag", () => {
  within({ plugin: fixtureRoot(join(tmp, "badroot"), { modes: { ...CLEAN, future: FUTURE }, styles: { brisk: BRISK }, manual: MANUAL }) })

  test("warns, naming the file, the key and which way it read, and still completes", () => {
    const warnings: string[] = []
    sync((line) => warnings.push(line))
    const said = warnings.join("\n")
    assert.ok(said.includes("future") && said.includes("no-implement") && said.includes("read as on"), said)
  })
})

describe("ground rules, once per conversation", () => {
  const LAW = "---\nname: law\nsummary: a fixture rule\n---\n\nAlways hand {{USER}} the receipt.\n"
  const AXIOM = "---\nname: axiom\nsummary: another\n---\n\nNever guess a checkable fact.\n"
  within({ plugin: fixtureRoot(join(tmp, "ruleroot"), { modes: CLEAN, rules: { law: LAW, axiom: AXIOM } }) })

  test("the first call prints every body under one heading, then nothing until clear --announced re-arms them", () => {
    const session = sid()
    const first = rulesDue({ session }) ?? ""
    assert.ok(first.includes("Ground rules") && first.includes("receipt") && first.includes("Never guess") && !first.includes("{{"), first)
    assert.equal(rulesDue({ session }), undefined)
    clear({ session, announced: true })
    assert.match(rulesDue({ session }) ?? "", /Ground rules/)
  })

  test("a user file sharing a shipped stem with an empty body silences that rule only", () => {
    const silencer = write(join(config, "mode", "rules", "law.md"), "---\nname: law\nsummary: silenced\n---\n")
    try {
      const said = rulesDue({ session: sid() }) ?? ""
      assert.ok(!said.includes("receipt") && said.includes("Never guess"), said)
    } finally {
      rmSync(silencer)
    }
  })
})

describe("a scoped ground rule", () => {
  const LAW = "---\nname: law\nsummary: a fixture rule\n---\n\nAlways hand {{USER}} the receipt.\n"
  const PAGES = "---\nname: pages\nsummary: scoped\nwhen: mockup|landing page\n---\n\nEvery page ships the toggle.\n"
  within({ plugin: fixtureRoot(join(tmp, "ruleroot2"), { modes: CLEAN, rules: { law: LAW, pages: PAGES } }) })

  test("stays out until a prompt matches its pattern, fires alone then, and never again", () => {
    const session = sid()
    const first = rulesDue({ session, message: "carry on" }) ?? ""
    assert.ok(first.includes("receipt") && !first.includes("toggle"), first)
    const matched = rulesDue({ session, message: "a mockup of settings" }) ?? ""
    assert.ok(matched.includes("toggle") && !matched.includes("receipt"), matched)
    assert.equal(rulesDue({ session, message: "another mockup" }), undefined)
  })

  test("no rules anywhere is nothing at all", () => {
    process.env.MODE_PLUGIN_ROOT = fixtureRoot(join(tmp, "norules"), { modes: CLEAN })
    assert.equal(rulesDue({ session: sid() }), undefined)
  })
})

describe("a ground rule that outranks the contracts", () => {
  const LAW = "---\nname: law\nsummary: a fixture rule\n---\n\nAlways hand {{USER}} the receipt.\n"
  const VOICE = "---\nname: voice\nsummary: outranks\noutranks: contracts\n---\n\nTalk like a person.\n\n## Standing reminder\n\n- Say it like a person would.\n"
  within({ plugin: fixtureRoot(join(tmp, "overroot"), { modes: CLEAN, rules: { law: LAW, voice: VOICE } }) })

  test("is restated by announce every turn, after the contract's reminder, while a plain rule never is", () => {
    assert.match(announce({ session: sid() }), /Ground rule voice[\s\S]*like a person would/)
    const session = sid()
    set("mode", session, "maker")
    announce({ session })
    const later = announce({ session })
    assert.ok(later.indexOf("Active mode: maker") >= 0 && later.indexOf("Ground rule voice") > later.indexOf("Active mode: maker"), later)
    assert.ok(!later.includes("receipt"))
  })
})

describe("version", () => {
  test("prints what the running copy's manifest says, and the shipped one carries a version", () => {
    process.env.MODE_PLUGIN_ROOT = fixtureRoot(join(tmp, "vroot"), {})
    write(join(tmp, "vroot", ".claude-plugin", "plugin.json"), '{"name": "mode", "version": "9.9.9"}\n')
    assert.equal(version(), "9.9.9")
    process.env.MODE_PLUGIN_ROOT = PLUGIN
    assert.ok(version())
    process.env.MODE_PLUGIN_ROOT = root
  })

  test("a missing manifest, or one with no version, is a sentence naming what it costs", () => {
    process.env.MODE_PLUGIN_ROOT = fixtureRoot(join(tmp, "noman"), {})
    refuses(() => version(), 1)
    write(join(tmp, "noman", ".claude-plugin", "plugin.json"), '{"name": "mode"}\n')
    assert.match(refuses(() => version(), 1).message, /unknown/)
    process.env.MODE_PLUGIN_ROOT = root
  })
})

// Jev is answered by a local fake, so each reading is fixed by the request it was asked about.
const READINGS: Record<string, Record<string, number>> = {
  "wrap up": { work: 0.9, broadcast: 0.84, session_aaaa1111: 0.4, session_bbbb2222: 0.2 },
  "invest email": { work: 0.95, broadcast: 0.1, session_aaaa1111: 0.88, session_bbbb2222: 0.02 },
  "calendar bug": { work: 0.96, broadcast: 0.1, session_aaaa1111: 0.04, session_bbbb2222: 0.04 },
  "who edits the reel": { work: 0.06, broadcast: 0.07, session_aaaa1111: 0.03, session_bbbb2222: 0.97 },
  "both fit": { work: 0.9, broadcast: 0.1, session_aaaa1111: 0.8, session_bbbb2222: 0.9 },
  "write it up as a page": { change: 0.1, artifact: 0.92, post: 0.03 },
}

const jev = createServer((request, response) => {
  let body = ""
  request.on("data", (chunk: Buffer) => (body += chunk))
  request.on("end", () => {
    const { state, questions } = JSON.parse(body) as { state: { request?: string; ask?: string }; questions: Record<string, unknown> }
    const reading = READINGS[state.request ?? state.ask ?? ""] ?? {}
    const answers = Object.fromEntries(Object.entries(reading).filter(([name]) => name in questions).map(([name, p]) => [name, { noul: p }]))
    response.end(JSON.stringify({ answers }))
  })
})
const jevUrl = new Promise<string>((resolve) => jev.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(jev.address() as AddressInfo).port}`)))
after(() => jev.close())

describe("triage, Jev's reading of where one request goes", () => {
  const home = join(tmp, "triage")
  within({ home, vars: { MODE_JEV: "", OPENROUTER_API_KEY: "test" } })
  before(async () => {
    write(join(home, "mode", "config.json"), JSON.stringify({ "jev-url": await jevUrl }))
    for (const [id, name] of [["aaaa1111-x", "[MF] Invest transferred amount"], ["bbbb2222-y", "[Nana] Chamonix reel"]]) {
      write(join(home, "sessions", `${id}.json`), JSON.stringify({ sessionId: id, pid: process.pid, name, cwd: "/repo" }))
    }
  })

  test("relays, starts new, answers or asks, naming the sessions each outcome is about", async () => {
    const outcome = async (request: string): Promise<string> => {
      const verdict = await triage(request)
      return verdict ? triageReport(verdict) : ""
    }
    const wrap = await outcome("wrap up")
    assert.ok(wrap.startsWith("relay to aaaa1111") && wrap.includes("bbbb2222"), wrap)
    const invest = await outcome("invest email")
    assert.ok(invest.startsWith("relay to aaaa1111") && !invest.includes("bbbb2222 ["), invest)
    assert.match(await outcome("calendar bug"), /^new \(/)
    assert.match(await outcome("who edits the reel"), /^answer about bbbb2222/)
    assert.match(await outcome("both fit"), /^ask between aaaa1111/)
  })

  test("with no reading there is no verdict, leaving the call to the dispatcher", async () => {
    write(join(home, "mode", "config.json"), JSON.stringify({ "jev-url": "http://127.0.0.1:9" }))
    assert.equal(await triage("wrap up"), undefined)
  })
})

describe("deliverable, the north star of the ask in hand", () => {
  const home = join(tmp, "north")
  const session = "d311ab1e-north"
  const path = "/work/acme/repo"
  within({ plugin: PLUGIN, home, vars: { MODE_JEV: "", OPENROUTER_API_KEY: "test" } })
  before(async () => {
    write(join(home, "mode", "config.json"), JSON.stringify({ delivery: [["acme", "mr-merged"]], "jev-url": await jevUrl }))
    for (const [name, delivers] of [["allround", "answer, change, artifact, post"], ["pages", "artifact"]]) {
      write(join(home, "mode", "modes", `${name}.md`), contract({ name: name ?? "", keys: `deliverables: ${delivers}\n` }))
    }
  })
  const deliverable = (words: string[], at = path, message?: string) => deliverableCommand({ words, session, path: at, message })

  test("with nothing named, every turn says so, how a change ships here, and the chip says none", () => {
    set("mode", session, "allround")
    const said = announce({ session, path })
    assert.ok(said.includes("Deliverable: none named") && said.includes("an MR, done when merged (the `acme` row)"), said)
    assert.match(chips(session), /\u{1F3AF} none/u)
  })

  test("naming one reads back the intent, how it ships and its line, and acts are checked against it", async () => {
    assert.equal(
      (await deliverable(["change", "the retry fix merged"])).text,
      "change, and a change here ships as an MR, done when merged (the `acme` row). the retry fix merged.",
    )
    assert.equal((await deliverable(["check", "push"])).code, 0)
    const elsewhere = await deliverable(["check", "push"], "/work/other")
    assert.ok(elsewhere.code === 1 && elsewhere.text?.includes("`delivery` row") && elsewhere.text.includes("--ship push"), elsewhere.text)
    const post = await deliverable(["check", "post"])
    assert.ok(post.code === 1 && post.text?.includes("add post"), post.text)
  })

  test("a mode that cannot deliver a change drops it and refuses to name one", async () => {
    set("mode", session, "pages")
    assert.equal((await deliverable([])).code, 1)
    await assert.rejects(deliverable(["change", "x"]), (error) => error instanceof Refusal && error.code === 2 && error.message.includes("pages delivers artifact"))
  })

  test("Jev's reading of an ask is recorded as its own, marked on the chip, only while nothing is named", async () => {
    await deliverable(["read"], path, "write it up as a page")
    assert.match(chips(session), /\u{1F3AF} ~artifact/u)
    await deliverable(["read"], path, "write it up as a page")
    assert.match((await deliverable([])).text ?? "", /artifact/)
  })

  test("deliverables leads with how a change ships here, then every mode and project", () => {
    const report = deliverablesReport(path)
    assert.ok(report.startsWith("Here a change ships as an MR") && report.includes("pages") && report.includes("anything else"), report)
  })
})

describe("choose over a pin, and the style a mode brings with it", () => {
  const home = join(tmp, "pinned")
  const work = join(home, "work")
  within({ plugin: PLUGIN, home })
  before(() => {
    mkdirSync(work, { recursive: true })
    const fixtures = [
      ["modes", "router", "enter-when: you are router|route these\nenter-over-pin: true\nstyle: brisk\n"],
      ["modes", "plainmode", "enter-when: plain work\n"],
      ["styles", "brisk", ""],
      ["styles", "formal", ""],
    ]
    for (const [folder = "", name = "", keys] of fixtures) write(join(home, "mode", folder, `${name}.md`), contract({ name, keys }))
    pin({ axis: "mode", name: "plainmode", path: work })
    pin({ axis: "style", name: "formal", path: work })
  })
  const pinned = (): string => {
    const session = sid()
    adopt({ path: work, session })
    return session
  }
  const routes = (session: string, message: string): string => choose({ axis: "mode", session, message })

  test("a mode that opts in takes a pinned slot only when its role opens the prompt", () => {
    assert.equal(routes(pinned(), "you are router. send these out"), "router")
    assert.equal(routes(pinned(), "plain work please"), "")
    assert.equal(routes(pinned(), "fix the login. then you are router"), "")
    const typed = sid()
    set("mode", typed, "plainmode")
    assert.equal(routes(typed, "you are router. go"), "")
  })

  test("entering it puts its own style over the pinned one, unless the conversation typed a style or typed it off", () => {
    const over = pinned()
    set("mode", over, "router", true)
    const [name, , mark] = chip("style", over)
    assert.deepEqual([name, mark], ["brisk", "chosen"])
    const [kept, off] = [sid(), sid()]
    set("style", kept, "formal")
    set("style", off, "off")
    set("mode", kept, "router")
    set("mode", off, "router")
    assert.deepEqual([get("style", kept), get("style", off)], ["formal", ""])
  })
})
