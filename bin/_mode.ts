import { readFileSync } from "node:fs"
import type { Axis } from "../shared/types/mode.ts"
import { announce } from "../lib/mode/announce.ts"
import { list, show, version } from "../lib/mode/catalogue.ts"
import { AXES } from "../lib/mode/constants.ts"
import { deliverableCommand, deliverablesReport } from "../lib/mode/deliverable.ts"
import { pin, pinsReport } from "../lib/mode/pins.ts"
import { stepReport } from "../lib/mode/pipeline.ts"
import { Refusal } from "../lib/mode/refusal.ts"
import { rulesDue } from "../lib/mode/rules.ts"
import { adopt, approve, axisOf, chips, choose, clear, done, exitSlot, expired, getSlot, red, setSlot, standing } from "../lib/mode/slots.ts"
import { sync } from "../lib/mode/sync.ts"
import { triage, triageReport } from "../lib/mode/triage.ts"
import { whyReport } from "../lib/mode/why.ts"

type Parsed = { positionals: string[]; values: Record<string, string>; flags: Set<string> }
type Args = Parsed & { session?: string; path?: string }
// A string prints and exits 0; nothing at all is the deliberate exit 1 a hook tells apart from a crash.
type Outcome = string | { text?: string; code: number }
type Run = (args: Args) => Outcome | Promise<Outcome>
type Spec = { help: string; usage?: string; values?: string[]; flags?: string[]; min?: number; max?: number; run: Run }

const NOTHING = { code: 1 }
const GLOBAL = ["session", "path"]

class UsageError extends Error {}
class HelpRequest extends Error {}

const NEGATIVE = /^-\d+$|^-\d*\.\d+$/

const orNothing = (text: string | undefined): Outcome => text ?? NOTHING

function axisArg(value: string, label: string): Axis {
  if (value === "mode" || value === "style") return value
  throw new UsageError(`argument ${label}: invalid choice: '${value}' (choose from 'mode', 'style')`)
}

function slotVerbs(axis: Axis): Record<string, Spec> {
  return {
    set: {
      help: "hold a contract, or auto to choose per message, or off",
      usage: "<name>",
      flags: ["chosen"],
      min: 1,
      max: 1,
      run: ({ positionals: [name = ""], flags, session }) => setSlot({ axis, session, name, chosen: flags.has("chosen") }),
    },
    get: { help: "print what the slot holds", flags: ["chip"], max: 0, run: ({ flags, session }) => getSlot({ axis, session, chip: flags.has("chip") }) },
    done: {
      help: "record something the held contract waits on, such as mr-opened",
      usage: "<reason>",
      min: 1,
      max: 1,
      run: ({ positionals: [reason = ""], session }) => done({ axis, session, reason }),
    },
    step: {
      help: "where the held pipeline stands, or exit 1 when it declares none",
      flags: ["tsv"],
      max: 0,
      run: ({ flags, session }) => orNothing(stepReport(axis, session, flags.has("tsv"))),
    },
    pin: {
      help: "hold a contract for this directory in every later conversation",
      usage: "[name]",
      flags: ["forget"],
      max: 1,
      run: ({ positionals: [name], flags, path }) => orNothing(pin({ axis, name, forget: flags.has("forget"), path })),
    },
    expired: { help: "print why the held contract is over, or exit 1 while it stands", max: 0, run: ({ session }) => orNothing(expired({ axis, session })) },
    exit: { help: "end the held contract: back to auto when chosen, off when typed", max: 0, run: ({ session }) => orNothing(exitSlot({ axis, session })) },
  }
}

const VERBS: Record<string, Spec> = {
  chips: { help: "one chip per axis with colour, ready to paste into a status line", flags: ["stdin"], max: 0, run: ({ session }) => chips(session) },
  pins: { help: "what a fresh conversation here would start in, and which file decided it", max: 0, run: ({ path }) => pinsReport(path) },
  adopt: { help: "fill an untouched slot from the nearest pin, or exit 1 when none applies", max: 0, run: (args) => orNothing(adopt(args)) },
  red: { help: "print test-fail while a watched failure stands, or exit 1 once a pass closes it", max: 0, run: ({ session }) => orNothing(red(session)) },
  triage: {
    help: "Jev's outcome for one request: new, relay, answer or ask, with its target",
    usage: "<request>",
    min: 1,
    max: 1,
    run: async ({ positionals: [request = ""] }) => {
      const verdict = await triage(request)
      if (!verdict) throw new Refusal("Jev gave no reading, so the outcome is yours to decide.")
      return triageReport(verdict)
    },
  },
  deliverable: {
    help: "the ask's north star: show it, name it, mark it done, check an act against it, or let Jev read it",
    usage: "[intent|done|check|read ...]",
    values: ["ship", "message"],
    run: ({ positionals, values, session, path }) => deliverableCommand({ words: positionals, ship: values.ship, message: values.message, session, path }),
  },
  deliverables: { help: "what each mode delivers, and how a change ships here and per project", max: 0, run: ({ path }) => deliverablesReport(path) },
  why: { help: "slots, pipeline, gates, ground rules and what the next prompt will carry", max: 0, run: (args) => whyReport(args) },
  choose: {
    help: "the contract a message asks for, while that slot is on auto",
    values: ["axis", "message"],
    max: 0,
    run: ({ values, session }) => {
      if (!("axis" in values) || !("message" in values)) throw new UsageError("the following arguments are required: --axis, --message")
      return choose({ axis: axisArg(values.axis ?? "", "--axis"), session, message: values.message ?? "" })
    },
  },
  standing: { help: "both standing reminders, mode first", max: 0, run: ({ session }) => standing(session) },
  rules: {
    help: "each ground rule once per conversation, exit 1 when nothing is due",
    values: ["message"],
    max: 0,
    run: ({ values, session }) => orNothing(rulesDue({ session, message: values.message })),
  },
  axis: {
    help: "which axis owns a contract name, so a bare name can be routed",
    usage: "<name>",
    min: 1,
    max: 1,
    run: ({ positionals: [name = ""] }) => orNothing(axisOf(name)),
  },
  list: {
    help: "every contract with its summary, marking the held one",
    usage: "[mode|style]",
    flags: ["tsv"],
    max: 1,
    run: ({ positionals: [axis], flags, session }) => list({ axis: axis ? axisArg(axis, "axis") : undefined, tsv: flags.has("tsv"), session }),
  },
  show: {
    help: "the full contract of what is held, or of a contract named outright",
    usage: "[mode|style|<name>]",
    flags: ["meta"],
    max: 1,
    run: ({ positionals: [target], flags, session }) => show({ target, meta: flags.has("meta"), session }),
  },
  announce: { help: "the whole contract on the turn it is entered, the reminder after", max: 0, run: (args) => announce(args) },
  approve: {
    help: "record the artifact the user approved, or print the recorded one",
    usage: "[slug]",
    flags: ["any-mode"],
    max: 1,
    run: ({ positionals: [slug], flags, session }) => orNothing(approve({ slug, anyMode: flags.has("any-mode"), session })),
  },
  clear: {
    help: "empty both slots",
    flags: ["announced"],
    max: 0,
    run: ({ flags, session }) => {
      clear({ session, announced: flags.has("announced") })
      return ""
    },
  },
  sync: {
    help: "rewrite the skill's registries from the contract folders",
    max: 0,
    run: () => {
      sync((line) => console.error(line))
      return ""
    },
  },
  version: { help: "the version of the copy that is running, to check an update took", max: 0, run: () => version() },
}

function usage(): string {
  const rows = [
    ...AXES.flatMap((axis) => Object.entries(slotVerbs(axis)).map(([verb, spec]) => [`${axis} ${verb} ${spec.usage ?? ""}`.trim(), spec.help])),
    ...Object.entries(VERBS).map(([verb, spec]) => [`${verb} ${spec.usage ?? ""}`.trim(), spec.help]),
  ]
  const width = Math.max(...rows.map(([left = ""]) => left.length))
  return [
    "usage: mode [--session ID] [--path DIR] <command> ...",
    "",
    "Track the mode and the style a conversation is working in.",
    "",
    ...rows.map(([left = "", help]) => `  ${left.padEnd(width)}  ${help}`),
  ].join("\n")
}

function parse(argv: string[], spec: Pick<Spec, "values" | "flags" | "min" | "max" | "usage">): Parsed {
  const parsed: Parsed = { positionals: [], values: {}, flags: new Set() }
  const takesValue = new Set([...GLOBAL, ...(spec.values ?? [])])
  const isFlag = new Set(spec.flags ?? [])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ""
    if (arg === "--") {
      parsed.positionals.push(...argv.slice(i + 1))
      break
    }
    if (arg === "-h" || arg === "--help") throw new HelpRequest()
    // Like argparse, a dash-led token is an option unless it reads as a negative number.
    if (!arg.startsWith("-") || arg === "-" || NEGATIVE.test(arg)) {
      parsed.positionals.push(arg)
      continue
    }
    if (!arg.startsWith("--")) throw new UsageError(`unrecognized arguments: ${arg}`)
    const eq = arg.indexOf("=")
    const name = arg.slice(2, eq < 0 ? undefined : eq)
    if (isFlag.has(name) && eq < 0) {
      parsed.flags.add(name)
    } else if (takesValue.has(name)) {
      if (eq < 0 && i + 1 >= argv.length) throw new UsageError(`argument --${name}: expected one argument`)
      parsed.values[name] = eq < 0 ? (argv[++i] ?? "") : arg.slice(eq + 1)
    } else {
      throw new UsageError(`unrecognized arguments: ${arg}`)
    }
  }
  if (parsed.positionals.length < (spec.min ?? 0)) throw new UsageError(`the following arguments are required: ${spec.usage ?? ""}`)
  const extra = parsed.positionals.slice(spec.max ?? Infinity)
  if (extra.length) throw new UsageError(`unrecognized arguments: ${extra.join(" ")}`)
  return parsed
}

function print(text: string): void {
  process.stdout.write(`${text}\n`)
}

// A status line that exits non-zero loses the whole line, so chips never parses strictly and never fails.
function chipsFastPath(rest: string[]): void {
  const at = rest.indexOf("--session") + 1
  let session = at > 0 && at < rest.length ? rest[at] : undefined
  try {
    // The status line pipes its JSON straight in, so nothing has to parse it for the id first.
    if (!session && rest.includes("--stdin")) {
      const data: unknown = JSON.parse(readFileSync(0, "utf8") || "{}")
      const id = typeof data === "object" && data ? (data as { session_id?: unknown }).session_id : undefined
      session = id ? String(id) : undefined
    }
    print(chips(session))
  } catch {}
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "chips") {
    chipsFastPath(argv.slice(1))
    return 0
  }
  let lead = 0
  while (/^--(session|path)(=|$)/.test(argv[lead] ?? "")) lead += argv[lead]?.includes("=") ? 1 : 2
  const globals = parse(argv.slice(0, lead), {})
  const [verb = "", ...rest] = argv.slice(lead)
  if (verb === "-h" || verb === "--help") throw new HelpRequest()
  if (!verb) throw new UsageError("the following arguments are required: cmd")
  const slot = verb === "mode" || verb === "style"
  const [sub = "", ...more] = slot ? rest : []
  const spec = slot ? slotVerbs(verb)[sub] : VERBS[verb]
  if (!spec) throw new UsageError(slot ? `argument slotcmd: invalid choice: '${sub}'` : `argument cmd: invalid choice: '${verb}'`)
  const parsed = parse(slot ? more : rest, spec)
  const outcome = await spec.run({ ...parsed, session: parsed.values.session ?? globals.values.session, path: parsed.values.path ?? globals.values.path })
  const { text, code } = typeof outcome === "string" ? { text: outcome, code: 0 } : outcome
  if (text) print(text)
  return code
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  if (error instanceof Refusal) {
    console.error(error.message)
    process.exitCode = error.code
  } else if (error instanceof HelpRequest) {
    print(usage())
  } else if (error instanceof UsageError) {
    console.error(`usage: mode [--session ID] [--path DIR] <command> ...\nmode: error: ${error.message}`)
    process.exitCode = 2
  } else {
    throw error
  }
}
