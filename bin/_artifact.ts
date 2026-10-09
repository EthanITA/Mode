import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { ingest, install, readDoc, render, reply } from "../lib/artifact/review.ts";
import {
  artifactFiles,
  documentSlug,
  dropped,
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
import { isFile } from "../lib/files.ts";
import { Refusal } from "../lib/mode/refusal.ts";
import { pyJson, pyStr } from "../lib/text.ts";

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
  run: (args: Parsed) => string | void;
};

class UsageError extends Error {}

const NEGATIVE = /^-\d+$|^-\d*\.\d+$/;

const print = (text: string): void => void process.stdout.write(`${text}\n`);
const stemOf = (path: string): string => basename(path, extname(path));

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
      return `${artifactFiles().includes(path) ? stemOf(path) : documentSlug(path)} recorded for this conversation`;
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
  open: {
    help: "open the artifact, locally or on the web",
    positionals: 1,
    options: { web: "flag" },
    run: ({ positionals: [slug = ""], flags }) => {
      const path = resolve(slug);
      let target = path;
      if (flags.has("web")) {
        const meta = readMeta(path);
        if (meta.url) target = meta.url;
        else console.error(`no published URL recorded for ${meta.slug}, opening the local file`);
      }
      // Absolute on macOS because bin/open on PATH shadows the system one inside a Notes-style tree.
      spawnSync(process.platform === "darwin" ? "/usr/bin/open" : "xdg-open", [target], { stdio: "inherit" });
    },
  },
  review: {
    help: "add or refresh the comment layer, keeping the threads it holds",
    positionals: 1,
    options: { sidecar: "value" },
    run: ({ positionals: [slug = ""], values }) => {
      const path = resolve(slug);
      const what = install(path, values.sidecar ?? "");
      record(entryOf(path));
      return `review layer ${what} in ${basename(path)}`;
    },
  },
  comments: {
    help: "read the comments on an artifact, and answer them",
    positionals: 1,
    options: { ingest: "value", "no-ingest": "flag", reply: "two", resolve: "many", json: "flag" },
    run: ({ positionals: [slug = ""], values, lists, flags }) => {
      const path = resolve(slug);
      const answer = lists.reply ?? lists.resolve;
      if (answer) {
        const [n = "", body = ""] = answer;
        const thread = reply({ path, n, body, resolve: !lists.reply });
        return `#${pyStr(thread.n)} is now ${pyStr(thread.status)}`;
      }
      const source = values.ingest ?? dropped(stemOf(path));
      const out: string[] = [];
      if (source && !flags.has("no-ingest")) {
        if (!isFile(source)) throw new Refusal(`no such file: ${source}`);
        const [added, total] = ingest(path, JSON.parse(readFileSync(source, "utf8")));
        out.push(`took ${added} new comment(s) from ${source}, ${total} total`);
      }
      const doc = readDoc(path);
      out.push(flags.has("json") ? pyJson(doc, false, 2) : render(doc, stemOf(path)));
      return out.join("\n");
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
      record(entryOf(path));
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
    "Scaffold, resolve, open and stamp the artifacts in the artifacts directory.",
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
  const out = spec.run(parse(rest, spec));
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
