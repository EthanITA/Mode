import { readdirSync } from "node:fs";
import { basename, extname, join, resolve as resolvePath } from "node:path";
import { isDir, isFile, readTextSafe } from "../files.ts";
import { lines, strip } from "../text.ts";
import { isWebRecord, listRecords, recordPath } from "../web/records.ts";
import { documentSlug } from "./comments.ts";
import { ArtifactLists } from "./lists.ts";
import { Sidecar, configRoot, expandHome } from "./paths.ts";
import { Refusal } from "./refusal.ts";
import { Tracked } from "./tracked.ts";

const stem = (file: string): string => basename(file, extname(file));

const pages = (): string[] => {
  const dir = Sidecar.artifacts();
  if (!isDir(dir)) return [];
  const names = readdirSync(dir);
  const html = names.filter((name) => name.endsWith(".html") && !name.endsWith(".src.html"));
  const taken = new Set(html.map((name) => name.slice(0, -5)));
  const notes = names.filter((name) => name.endsWith(".md") && !taken.has(name.slice(0, -3)));
  return [...html, ...notes].sort().map((name) => join(dir, name));
};

const recordedDocuments = (): Map<string, string> => {
  const dir = join(configRoot(), "artifacts");
  const lists = isDir(dir) ? readdirSync(dir).filter((name) => name.startsWith("session-")) : [];
  const entries = lists.sort().flatMap((name) => lines(readTextSafe(join(dir, name)) ?? "").map(strip));
  const documents = entries.filter((entry) => entry.startsWith("/") && entry.endsWith(".md") && isFile(entry));
  return new Map(documents.map((entry) => [documentSlug(entry), entry]));
};

const path = (given: string, sid?: string): string => {
  if (given.includes("/") && given.endsWith(".md") && isFile(expandHome(given))) return resolvePath(expandHome(given));
  const token = given.replace(/\.(html|md)$/, "");
  const document = recordedDocuments().get(token) ?? Tracked.paths().get(token);
  if (document) return document;
  const files = [...pages(), ...listRecords().map((site) => recordPath(site.slug))];
  if (!files.length) throw new Refusal(`no artifacts in ${Sidecar.artifacts()}`);
  const recorded = new Set(ArtifactLists.entries(sid));
  const pools = recorded.size ? [files.filter((file) => recorded.has(stem(file))), files] : [files];
  for (const pool of pools) {
    for (const [stage, pick] of [
      ["exact", (file: string) => stem(file) === token],
      ["prefix", (file: string) => stem(file).startsWith(token)],
      ["substring", (file: string) => stem(file).includes(token)],
    ] as const) {
      const hits = pool.filter(pick);
      if (hits.length === 1) return hits[0] ?? "";
      if (hits.length > 1 && stage !== "exact")
        throw new Refusal(`'${token}' matches ${hits.length} artifacts:\n  ${hits.map(stem).join("\n  ")}`, 2);
    }
  }
  throw new Refusal(`no artifact matching '${token}'`);
};

const slug = (file: string): string => (isWebRecord(file) || pages().includes(file) ? stem(file) : documentSlug(file));

export const Resolve = { path, slug };
