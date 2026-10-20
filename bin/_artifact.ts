import { basename } from "node:path";
import { install } from "../lib/artifact/layer.ts";
import {
  documentSlug,
  ds,
  entryOf,
  installKit,
  listReport,
  readMeta,
  record,
  resolve,
  scaffold,
  stamp,
  TEMPLATES,
} from "../lib/artifact/store.ts";
import { Refusal } from "../lib/mode/refusal.ts";

type Parsed = {
  positionals: string[];
  values: Record<string, string>;
  lists: Record<string, string[]>;
  flags: Set<string>;
};
// Each option's shape the way argparse took it: a flag, one value, an optional value, exactly two, or one and more.
type Shape = "flag" | "value" | "optional" | "two" | "many";
type Spec = {
  help: string;
  positionals: number;
  optionalPositional?: boolean;
  options?: Record<string, Shape>;
  run: (args: Parsed) => Promise<string | void> | string | void;
};

class UsageError extends Error {}

const NEGATIVE = /^-\d+$|^-\d*\.\d+$/;

const print = (text: string): void => void process.stdout.write(`${text}\n`);
const slugOf = (path: string): string => (entryOf(path) === path ? documentSlug(path) : entryOf(path));

function parse(argv: string[], spec: Spec): Parsed {
  const parsed: Parsed = { positionals: [], values: {}, lists: {}, flags: new Set() };
  const options = spec.options ?? {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "-h" || arg === "--help") throw new UsageError("help");
    // Like argparse, a dash-led token is an option unless it reads as a negative number.
    if (!arg.startsWith("-") || arg === "-" || NEGATIVE.test(arg)) {
      parsed.positionals.push(arg);
      continue;
    }
    if (!arg.startsWith("--")) throw new UsageError(`unrecognized arguments: ${arg}`);
    const eq = arg.indexOf("=");
    const name = arg.slice(2, eq < 0 ? undefined : eq);
    const shape = options[name];
    const following = (): boolean => i + 1 < argv.length && !(argv[i + 1] ?? "").startsWith("-");
    if (!shape) throw new UsageError(`unrecognized arguments: ${arg}`);
    if (shape === "flag") parsed.flags.add(name);
    else if (eq >= 0) parsed.values[name] = arg.slice(eq + 1);
    else if (shape === "optional") parsed.values[name] = following() ? (argv[++i] ?? "") : "";
    else if (shape === "value") {
      if (i + 1 >= argv.length) throw new UsageError(`argument --${name}: expected one argument`);
      parsed.values[name] = argv[++i] ?? "";
    } else {
      const limit = shape === "two" ? 2 : Infinity;
      const taken: string[] = [];
      while (taken.length < limit && following()) taken.push(argv[++i] ?? "");
      if (taken.length < (shape === "two" ? 2 : 1))
        throw new UsageError(
          `argument --${name}: expected ${shape === "two" ? "2 arguments" : "at least one argument"}`,
        );
      parsed.lists[name] = taken;
    }
  }
  const min = spec.optionalPositional ? 0 : spec.positionals;
  if (parsed.positionals.length < min) throw new UsageError("the following arguments are required: slug");
  if (parsed.positionals.length > spec.positionals)
    throw new UsageError(`unrecognized arguments: ${parsed.positionals.slice(spec.positionals).join(" ")}`);
  return parsed;
}

const VERBS: Record<string, Spec> = {
  list: {
    help: "every artifact, newest first, with its published URL",
    positionals: 0,
    options: { session: "optional", tsv: "flag" },
    run: ({ values, flags }) =>
      listReport({ mine: "session" in values, session: values.session, tsv: flags.has("tsv") }),
  },
  ds: {
    help: "resolve a design pack: shipped set first, then the user's own",
    positionals: 1,
    optionalPositional: true,
    run: ({ positionals: [key] }) => ds(key),
  },
  touch: {
    help: "record a slug, or a .md by its path, against this conversation",
    positionals: 1,
    run: ({ positionals: [slug = ""] }) => {
      const path = resolve(slug);
      record(entryOf(path));
      return `${slugOf(path)} recorded for this conversation`;
    },
  },
  path: {
    help: "print the local file path for a slug",
    positionals: 1,
    run: ({ positionals: [slug = ""] }) => resolve(slug),
  },
  url: {
    help: "print the published URL for a slug",
    positionals: 1,
    run: ({ positionals: [slug = ""] }) => {
      const meta = readMeta(resolve(slug));
      if (!meta.url)
        throw new Refusal(
          `${meta.slug} has no published URL recorded. Publish it, then: artifact stamp ${meta.slug} --url <url>`,
        );
      return meta.url;
    },
  },
  review: {
    help: "add or refresh the comment layer, keeping the threads it holds",
    positionals: 1,
    options: { sidecar: "value" },
    // The layer, like the kit, is upkeep rather than authorship, so only a stamp lists the page as this conversation's.
    run: ({ positionals: [slug = ""], values }) => {
      const path = resolve(slug);
      return `review layer ${install(path, values.sidecar ?? "")} in ${basename(path)}`;
    },
  },
  new: {
    help: "scaffold a local page: template, the pack's stylesheets, the kit, the review layer, stamped",
    positionals: 1,
    options: { ds: "value", title: "value", template: "value" },
    run: ({ positionals: [slug = ""], values }) => {
      if (!values.ds) throw new UsageError("the following arguments are required: --ds");
      const template = values.template ?? "interactive";
      if (!TEMPLATES.includes(template)) throw new UsageError(`argument --template: invalid choice: '${template}'`);
      return scaffold({ slug, ds: values.ds, title: values.title, template });
    },
  },
  kit: {
    help: "add or refresh the component kit, before </head>",
    positionals: 1,
    run: ({ positionals: [slug = ""] }) => {
      const path = resolve(slug);
      if (path.endsWith(".md"))
        throw new Refusal(`${basename(path)} is rendered by the sidecar, so it has no page to carry the kit`, 2);
      print(`kit ${installKit(path)} in ${basename(path)}`);
    },
  },
  stamp: {
    help: "write or update the metadata block",
    positionals: 1,
    options: { url: "value", ds: "value", target: "value", title: "value", updated: "value" },
    run: ({ positionals: [slug = ""], values }) => {
      const path = resolve(slug);
      stamp(path, values);
      return `stamped ${basename(path)}`;
    },
  },
};

function usage(): string {
  const width = Math.max(...Object.keys(VERBS).map((verb) => verb.length));
  return [
    "usage: artifact <command> ...",
    "",
    "Scaffold, resolve and stamp the artifacts in the artifacts directory. The sidecar opens them and carries their comments.",
    "",
    ...Object.entries(VERBS).map(([verb, spec]) => `  ${verb.padEnd(width)}  ${spec.help}`),
  ].join("\n");
}

try {
  const [verb = "", ...rest] = process.argv.slice(2);
  if (verb === "-h" || verb === "--help") throw new UsageError("help");
  const spec = VERBS[verb];
  if (!spec)
    throw new UsageError(
      verb ? `argument cmd: invalid choice: '${verb}'` : "the following arguments are required: cmd",
    );
  const out = await spec.run(parse(rest, spec));
  if (out) print(out);
} catch (error) {
  if (error instanceof Refusal) {
    console.error(error.message);
    process.exitCode = error.code;
  } else if (error instanceof UsageError && error.message === "help") {
    print(usage());
  } else if (error instanceof UsageError) {
    console.error(`usage: artifact <command> ...\nartifact: error: ${error.message}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
