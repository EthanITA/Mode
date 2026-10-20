import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { isFile } from "../files.ts";
import { pyJson, pyStr } from "../text.ts";
import { openRecord } from "../web/records.ts";
import { parseTarget } from "../web/target.ts";
import { ArtifactLists } from "./lists.ts";
import { Refusal } from "./refusal.ts";
import { Resolve } from "./resolve.ts";
import { Threads } from "./threads.ts";

const USAGE = 'usage: sidecar comments <slug> [--reply <n> "text"] [--resolve <n> ["what changed"]] [--json]';

const stem = (file: string): string => basename(file, extname(file));

const urlGiven = (given: string): URL | undefined => {
  if (/\.(html|md)$/.test(given) || /^[/~.]/.test(given)) return undefined;
  const isUrl =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(given) || /^[^\s/:]+(\.[^\s/.:]+)+(:\d+)?(\/|$)|^[^\s/:]+:\d+(\/|$)/.test(given);
  return isUrl ? parseTarget(given) : undefined;
};

const refusing = (work: () => number): number => {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(error.message);
    return error.code;
  }
};

const dropped = (slug: string): string | undefined => {
  const hit = join(homedir(), "Downloads", `${slug}.comments.json`);
  return isFile(hit) ? hit : undefined;
};

const comments = (argv: string[]): number =>
  refusing(() => {
    const { positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        reply: { type: "string" },
        resolve: { type: "string" },
        json: { type: "boolean" },
        ingest: { type: "string" },
        "no-ingest": { type: "boolean" },
      },
    });
    const [given = "", text = ""] = positionals;
    if (!given) {
      console.error(USAGE);
      return 2;
    }
    const path = Resolve.path(given);
    const n = values.reply ?? values.resolve;
    if (n) {
      const thread = Threads.reply({ path, n, body: text, resolve: !values.reply });
      console.log(`#${pyStr(thread.n)} is now ${pyStr(thread.status)}`);
      return 0;
    }
    const source = values.ingest ?? dropped(stem(path));
    if (source && !values["no-ingest"]) {
      if (!isFile(source)) throw new Refusal(`no such file: ${source}`);
      const [added, total] = Threads.ingest(path, JSON.parse(readFileSync(source, "utf8")));
      console.log(`took ${added} new comment(s) from ${source}, ${total} total`);
    }
    const doc = Threads.read(path);
    console.log(values.json ? pyJson(doc, false, 2) : Threads.render(doc, stem(path)));
    return 0;
  });

const artifact = (given: string, key?: string): string => {
  const site = urlGiven(given);
  if (!site) {
    try {
      return Resolve.slug(Resolve.path(given, key));
    } catch {
      return given;
    }
  }
  const { record } = openRecord({ reuse: ArtifactLists.entries(key), url: site });
  ArtifactLists.record(record.slug, key);
  return record.slug;
};

export const Commands = { artifact, comments };
