import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve as resolvePath } from "node:path";
import { isDir, isFile, readTextSafe } from "../files.ts";
import { modeConfig } from "../mode/config.ts";
import { configRoot, modeHome } from "../mode/paths.ts";
import { Refusal } from "../mode/refusal.ts";
import { head, lines, lstrip, pad, pyStr, strip, words } from "../text.ts";
import { readPage, root } from "./files.ts";
import { install } from "./review.ts";

export type Meta = Record<string, string>;

const BLOCK = /<!--\s*artifact\b([\s\S]*?)-->/;
const TITLE = /<title>([\s\S]*?)<\/title>/i;
const COMMENT = /<!--[\s\S]*?-->/g;
const FENCE = /^(```|~~~)[\s\S]*?^\1/gm;
const H1 = /^#[ \t]+(.+?)[ \t#]*$/m;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;
const KIT = /<!-- cx:start -->[\s\S]*?<!-- cx:end -->\n?/;
const FONT_LINK = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]+">/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const FIELDS = ["slug", "title", "url", "target", "ds", "updated"];
export const TEMPLATES = ["interactive", "showpiece"];

const stem = (path: string): string => basename(path, extname(path));
const expandHome = (path: string): string => (path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path);

export function artifactsDir(): string {
  if (process.env.NOTES_ARTIFACTS) return process.env.NOTES_ARTIFACTS;
  const configured = modeConfig().artifacts ? pyStr(modeConfig().artifacts) : "";
  return configured ? expandHome(configured) : join(homedir(), "artifacts");
}

// Same key the status line derives from its own session_id, so both sides agree.
const sessionDir = (): string => join(configRoot(), "artifacts");

function sessionFile(sid?: string): string | undefined {
  const id = sid || process.env.CLAUDE_CODE_SESSION_ID || "";
  return id ? join(sessionDir(), `session-${id.slice(0, 8)}`) : undefined;
}

// What this conversation created or updated, oldest first: a slug, or the path of a .md outside the folder.
export function sessionEntries(sid?: string): string[] {
  const seen = new Set<string>();
  for (const line of lines(readTextSafe(sessionFile(sid)) ?? "")) if (strip(line)) seen.add(strip(line));
  return [...seen];
}

export function record(entry: string, sid?: string): void {
  const file = sessionFile(sid);
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  if (!sessionEntries(sid).includes(entry)) appendFileSync(file, `${entry}\n`);
}

// The hash keeps two README.md apart. Mirrors Documents.slug in server/utils/sessions/artifact-lists.ts.
export function documentSlug(path: string): string {
  return `${stem(path).replace(/[^a-zA-Z0-9._-]+/g, "-")}--${createHash("sha1").update(path).digest("hex").slice(0, 6)}`;
}

export function documents(entries: string[]): Map<string, string> {
  return new Map(
    entries.filter((e) => e.startsWith("/") && e.endsWith(".md") && isFile(e)).map((e) => [documentSlug(e), e]),
  );
}

// Every .md any conversation recorded, which is the only way one outside the folder resolves.
function recordedDocuments(): Map<string, string> {
  const dir = sessionDir();
  const lists = isDir(dir)
    ? readdirSync(dir)
        .filter((name) => name.startsWith("session-"))
        .sort()
    : [];
  return documents(lists.flatMap((name) => lines(readTextSafe(join(dir, name)) ?? "").map(strip)));
}

export function artifactFiles(): string[] {
  const dir = artifactsDir();
  if (!isDir(dir)) return [];
  const names = readdirSync(dir);
  const pages = names.filter((name) => name.endsWith(".html") && !name.endsWith(".src.html"));
  const taken = new Set(pages.map((name) => name.slice(0, -5)));
  // A .md beside a same-named page is that page's brief, never a second artifact under one slug.
  const notes = names.filter((name) => name.endsWith(".md") && !taken.has(name.slice(0, -3)));
  return [...pages, ...notes].sort().map((name) => join(dir, name));
}

export function entryOf(path: string): string {
  return artifactFiles().includes(path) ? stem(path) : path;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u{a0}",
  mdash: "\u{2014}",
  ndash: "\u{2013}",
  middot: "\u{b7}",
  hellip: "\u{2026}",
  rsquo: "\u{2019}",
  lsquo: "\u{2018}",
  rdquo: "\u{201d}",
  ldquo: "\u{201c}",
  rarr: "\u{2192}",
  larr: "\u{2190}",
  bull: "\u{2022}",
  copy: "\u{a9}",
  reg: "\u{ae}",
  trade: "\u{2122}",
  times: "\u{d7}",
  laquo: "\u{ab}",
  raquo: "\u{bb}",
};

function unescapeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

export function readMeta(path: string): Meta {
  const top = head(readPage(path), 4000);
  const meta: Meta = { slug: stem(path), path };
  for (const line of lines(BLOCK.exec(top)?.[1] ?? "")) {
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = strip(line.slice(0, sep)).toLowerCase();
    if (FIELDS.includes(key)) meta[key] = strip(line.slice(sep + 1));
  }
  const markdown = path.endsWith(".md");
  if (!("title" in meta) && markdown) {
    meta.title = H1.exec(top.replace(COMMENT, "").replace(FENCE, ""))?.[1] ?? stem(path);
  } else if (!("title" in meta)) {
    const title = TITLE.exec(top)?.[1];
    meta.title = title ? words(unescapeHtml(title)).join(" ") : "";
  }
  // A local showpiece owns its own doctype; a published one never does, and a .md is never published.
  if (!("target" in meta))
    meta.target = markdown || lstrip(head(top, 20).toLowerCase()).startsWith("<!doctype") ? "s" : "b";
  return meta;
}

// A .md given by its path, then a recorded document's slug, then this conversation's artifacts, then the folder.
export function resolve(given: string, sid?: string): string {
  if (given.includes("/") && given.endsWith(".md") && isFile(expandHome(given))) return resolvePath(expandHome(given));
  const files = artifactFiles();
  const token = given.replace(/\.(html|md)$/, "");
  const document = recordedDocuments().get(token);
  if (document) return document;
  if (!files.length) throw new Refusal(`no artifacts in ${artifactsDir()}`);
  const recorded = new Set(sessionEntries(sid));
  const pools = recorded.size ? [files.filter((path) => recorded.has(stem(path))), files] : [files];
  for (const pool of pools) {
    for (const [stage, pick] of [
      ["exact", (path: string) => stem(path) === token],
      ["prefix", (path: string) => stem(path).startsWith(token)],
      ["substring", (path: string) => stem(path).includes(token)],
    ] as const) {
      const hits = pool.filter(pick);
      if (hits.length === 1) return hits[0] ?? "";
      // Exit 2, not 1: the shell wrapper shows this one and stays quiet about a plain miss.
      if (hits.length > 1 && stage !== "exact")
        throw new Refusal(`'${token}' matches ${hits.length} artifacts:\n  ${hits.map(stem).join("\n  ")}`, 2);
    }
  }
  throw new Refusal(`no artifact matching '${token}'. Try: artifact list`);
}

const skillDir = (): string => join(root(), "skills", "create-artifact");
// Shipped first, the user's own second, mirroring the plugin's contract folders.
const dsDirs = (): string[] => [join(skillDir(), "design-systems"), join(modeHome(), "design-systems")];

export function dsPacks(): Map<string, string> {
  const packs = new Map<string, string>();
  for (const dir of dsDirs()) {
    if (!isDir(dir)) continue;
    for (const name of readdirSync(dir)
      .filter((file) => file.endsWith(".md"))
      .sort()) {
      const path = join(dir, name);
      // The Kind line is the pack contract, so a reference .md beside a pack is not a key.
      if (stem(name) !== "REGISTRY" && head(readTextSafe(path) ?? "", 2000).includes("**Kind:**"))
        packs.set(stem(name), path);
    }
  }
  return packs;
}

export function ds(key?: string): string {
  const packs = dsPacks();
  if (!key) {
    if (!packs.size) throw new Refusal(`no design packs in ${dsDirs().join(" or ")}`);
    const width = Math.max(...[...packs.keys()].map((one) => Array.from(one).length));
    return [...packs.keys()]
      .sort()
      .map((one) => `${pad(one, width)}  ${packs.get(one)}`)
      .join("\n");
  }
  const pack = packs.get(key);
  if (!pack)
    throw new Refusal(`no design system named '${key}'. Installed:\n  ${[...packs.keys()].sort().join("\n  ")}`, 2);
  return pack;
}

// `mine` keeps only what one conversation touched, the one named by `session` or the current one.
export function listReport({
  mine = false,
  session,
  tsv = false,
}: {
  mine?: boolean;
  session?: string;
  tsv?: boolean;
}): string {
  let files = artifactFiles();
  let docs = new Map<string, string>();
  if (mine) {
    const entries = sessionEntries(session || undefined);
    files = files.filter((path) => entries.includes(stem(path)));
    docs = documents(entries);
  }
  const rows: Meta[] = [...files.map(readMeta), ...[...docs].map(([slug, path]) => ({ ...readMeta(path), slug }))];
  const mtime = (row: Meta): number => statSync(row.path ?? "").mtimeMs;
  rows.sort((a, b) => mtime(b) - mtime(a));
  if (tsv) return rows.map((row) => `${row.slug}\t${row.path}`).join("\n");
  if (!rows.length)
    throw new Refusal(mine ? "no artifacts touched in this conversation" : `no artifacts in ${artifactsDir()}`);
  const width = Math.max(...rows.map((row) => Array.from(row.slug ?? "").length));
  return rows
    .map(
      (row) =>
        `${pad(row.slug ?? "", width)}  ${pad(row.title || "(untitled)", 38)}  ${row.url || (row.target === "s" ? "local only" : "NO URL RECORDED")}`,
    )
    .join("\n");
}

function stylesheets(key: string, pack: string): string[] {
  const shared = [join(skillDir(), "assets", "doc-system.css"), join(skillDir(), "assets", "themes.css")];
  const own = pack.replace(/\.md$/, ".css");
  if (dirname(pack) === dsDirs()[0] || !isFile(own)) return shared;
  // A pack that keys on data-ds layers over the shared system; one that does not is the whole system.
  return (readTextSafe(own) ?? "").includes(`[data-ds="${key}"]`) ? [...shared, own] : [own];
}

export function installKit(path: string): string {
  const kit = readFileSync(join(skillDir(), "assets", "kit.html"), "utf8");
  const text = readPage(path);
  if (KIT.test(text)) {
    writeFileSync(
      path,
      text.replace(KIT, () => kit),
    );
    return "refreshed";
  }
  if (!text.includes("</head>")) throw new Refusal(`${basename(path)} has no </head> to anchor the kit to`);
  // Before </head>, so the layout CSS is in place for the first paint.
  writeFileSync(
    path,
    text.replace("</head>", () => kit + "</head>"),
  );
  return "added";
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

const localDate = (ms: number): string => {
  const at = new Date(ms);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
};

export function stamp(
  path: string,
  fields: Partial<Record<"url" | "ds" | "target" | "title" | "updated", string>>,
): void {
  let text = readPage(path);
  const meta = readMeta(path);
  for (const field of ["url", "ds", "target", "title"] as const) if (fields[field]) meta[field] = fields[field] ?? "";
  meta.slug = stem(path);
  // Defaults to the file's own mtime, so the date cannot drift from the build.
  meta.updated = fields.updated || localDate(statSync(path).mtimeMs);
  const body = FIELDS.filter((key) => meta[key])
    .map((key) => `${pad(`${key}:`, 9)}${meta[key]}`)
    .join("\n");
  const block = `<!-- artifact\n${body}\n-->`;
  const top = head(text, 4000);
  if (BLOCK.test(top)) {
    text = text.replace(BLOCK, () => block);
  } else if (path.endsWith(".md")) {
    const at = FRONTMATTER.exec(text)?.[0].length ?? 0;
    text = `${text.slice(0, at)}${block}\n${text.slice(at)}`;
  } else {
    const title = TITLE.exec(top);
    if (!title)
      throw new Refusal(`${basename(path)} has no <title>, so there is nothing to anchor the block to. Add one first.`);
    const end = title.index + title[0].length;
    text = `${text.slice(0, end)}\n${block}${text.slice(end)}`;
  }
  writeFileSync(path, text);
  record(entryOf(path));
}

export function scaffold({
  slug,
  ds: key,
  title,
  template,
}: {
  slug: string;
  ds: string;
  title?: string;
  template: string;
}): string {
  if (!SLUG.test(slug)) throw new Refusal(`'${slug}' is not a slug: lowercase words and digits joined by dashes`, 2);
  const path = join(artifactsDir(), `${slug}.html`);
  if (existsSync(path)) throw new Refusal(`${path} already exists. Edit it, or pick another slug`, 2);
  const pack = dsPacks().get(key);
  if (!pack)
    throw new Refusal(`no design system named '${key}'. Installed:\n  ${[...dsPacks().keys()].sort().join("\n  ")}`, 2);
  let page = readFileSync(join(skillDir(), "templates", `${template}.html`), "utf8");
  const font = FONT_LINK.exec(readTextSafe(pack) ?? "");
  const fills: [string, string][] = [
    ["DS_KEY", key],
    ["FONT_LINKS", font ? font[0] : ""],
  ];
  if (title) fills.push(["TITLE", escapeHtml(title)]);
  // Stylesheets go in last, so a placeholder-shaped string inside the CSS is never filled.
  fills.push([
    "INLINE_STYLESHEETS",
    stylesheets(key, pack)
      .map((css) => readFileSync(css, "utf8").replace(/\n+$/, ""))
      .join("\n"),
  ]);
  for (const [name, value] of fills) page = page.replaceAll(`{{${name}}}`, () => value);
  mkdirSync(artifactsDir(), { recursive: true });
  writeFileSync(path, page);
  installKit(path);
  install(path);
  stamp(path, { ds: key, target: "s", title });
  return path;
}

// What the page's Save button wrote, which lands wherever the browser puts a download.
export function dropped(slug: string): string | undefined {
  const hit = join(homedir(), "Downloads", `${slug}.comments.json`);
  return isFile(hit) ? hit : undefined;
}
