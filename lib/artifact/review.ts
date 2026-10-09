import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { isRecord, type Payload } from "../hook/io.ts";
import { modeConfig } from "../mode/config.ts";
import { Refusal } from "../mode/refusal.ts";
import {
  hasLegacyBlock,
  isStoredDocument,
  readComments,
  withoutLegacyBlock,
  writeComments,
} from "../sidecar/comments.ts";
import { lines, pad, pyJson, pyStr } from "../text.ts";
import { artifactsDir, readPage, root } from "./files.ts";

export type Thread = Payload & { id?: unknown; n?: unknown; at?: unknown; updated?: unknown; replies?: unknown };
export type Doc = Payload & { threads: Thread[] };

const BLOCK = /<!-- rv:start -->[\s\S]*?<!-- rv:end -->\n?/;
const SEED = /(<script type="application\/json" id="rv-seed">)([\s\S]*?)(<\/script>)/;
// A .md has no <script> to hold its threads, so they ride in one trailing comment. Mirrors MD_SEED in server/utils/artifacts.ts.
const MD_SEED = /(<!-- rv:seed\n)([\s\S]*?)(\n-->\n?)/;

const stem = (path: string): string => basename(path, extname(path));
const seedOf = (path: string): RegExp => (path.endsWith(".md") ? MD_SEED : SEED);
const userLabel = (): string => (modeConfig().user ? pyStr(modeConfig().user) : "User");

// Seconds and a Z, the shape the page and the sidecar both write.
export const now = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const asThreads = (value: unknown): Thread[] => (Array.isArray(value) ? value : []) as Thread[];

const isStored = (path: string): boolean => isStoredDocument(path, artifactsDir());

export function readDoc(path: string): Doc {
  if (isStored(path)) {
    const stored = readComments(path, readPage(path));
    return { v: 1, slug: stem(path), ...stored, threads: asThreads(stored?.threads) };
  }
  const found = seedOf(path).exec(readPage(path));
  if (!found) return { v: 1, slug: stem(path), threads: [] };
  let doc: Payload = {};
  try {
    const parsed: unknown = JSON.parse(found[2] ?? "");
    if (parsed) doc = parsed as Payload;
  } catch {}
  return {
    ...doc,
    v: "v" in doc ? doc.v : 1,
    slug: "slug" in doc ? doc.slug : stem(path),
    threads: asThreads(doc.threads),
  } as Doc;
}

export function writeDoc(path: string, doc: Doc): void {
  const text = readPage(path);
  if (isStored(path)) {
    writeComments(path, doc);
    // The first write moves an old trailing block out of the document.
    if (hasLegacyBlock(text)) writeFileSync(path, withoutLegacyBlock(text));
    return;
  }
  let body = pyJson(doc, false);
  if (path.endsWith(".md")) {
    // `-->` in a comment body would end the block early; the escape reads back as the same text.
    body = body.replaceAll("-->", "--\\u003e");
    if (!MD_SEED.test(text)) return writeFileSync(path, `${text.replace(/\n+$/, "")}\n\n<!-- rv:seed\n${body}\n-->\n`);
  } else if (!SEED.test(text)) {
    throw new Refusal(`${basename(path)} carries no review layer. Run: artifact review ${stem(path)}`);
  }
  writeFileSync(
    path,
    text.replace(seedOf(path), (_, open: string, __, close: string) => open + body + close),
  );
}

// Newest `updated` wins per thread, replies unioned: both sides edit the same page offline.
function merge(a: Thread[], b: Thread[]): Thread[] {
  const out = new Map<unknown, Thread>();
  for (const thread of [...a, ...b]) {
    if (!isRecord(thread) || !thread.id) continue;
    const prev = out.get(thread.id);
    if (!prev) {
      out.set(thread.id, { ...thread, replies: [...asThreads(thread.replies)] });
      continue;
    }
    const win = String(thread.updated || "") >= String(prev.updated || "") ? thread : prev;
    const seen = new Map<unknown, Thread>();
    for (const reply of [...asThreads(prev.replies), ...asThreads(thread.replies)])
      if (reply.id) seen.set(reply.id, reply);
    out.set(thread.id, { ...win, replies: [...seen.values()].sort(byAt) });
  }
  return [...out.values()].sort(byAt);
}

function byAt(a: Thread, b: Thread): number {
  const [x, y] = [String(a.at || ""), String(b.at || "")];
  return x < y ? -1 : x > y ? 1 : 0;
}

export function ingest(path: string, incoming: Payload): [added: number, total: number] {
  const doc = readDoc(path);
  const before = doc.threads.length;
  doc.threads = merge(doc.threads, asThreads(incoming.threads));
  doc.updated = now();
  writeDoc(path, doc);
  return [doc.threads.length - before, doc.threads.length];
}

// Inject or refresh the layer in place, carrying whatever threads the page already holds.
export function install(path: string, sidecar = ""): string {
  if (isStored(path)) return "already present";
  if (path.endsWith(".md")) {
    // The sidecar is a .md's comment surface, so its whole layer is the trailing block.
    if (MD_SEED.test(readPage(path))) return "already present";
    writeDoc(path, readDoc(path));
    return "added";
  }
  const layerFile = join(root(), "skills", "create-artifact", "assets", "review-layer.html");
  let layerSource: string;
  try {
    layerSource = readFileSync(layerFile, "utf8");
  } catch {
    throw new Refusal(`no review layer at ${layerFile}`);
  }
  const existing: Payload = SEED.test(readPage(path)) ? readDoc(path) : {};
  const doc = {
    v: 1,
    slug: stem(path),
    sidecar: sidecar || pyStr(existing.sidecar || ""),
    threads: asThreads(existing.threads),
  };
  const layer = layerSource.replace(SEED, (_, open: string, __, close: string) => open + pyJson(doc, false) + close);
  const text = readPage(path);
  if (BLOCK.test(text)) {
    writeFileSync(
      path,
      text.replace(BLOCK, () => layer),
    );
    return "refreshed";
  }
  if (!text.includes("</body>")) throw new Refusal(`${basename(path)} has no </body> to anchor the layer to`);
  writeFileSync(
    path,
    text.replace("</body>", () => layer + "</body>"),
  );
  return "added";
}

export function render(doc: Doc, slug: string): string {
  const threads = doc.threads;
  const opens = threads.filter((t) => t.status !== "resolved");
  const out = [`${slug}  ${opens.length} open, ${threads.length - opens.length} resolved`];
  if (!threads.length) return [...out, "\nNo comments. Nothing is blocking you."].join("\n");
  const user = userLabel();
  for (const thread of threads) {
    const anchor = isRecord(thread.anchor) ? thread.anchor : {};
    out.push(
      `\n#${pyStr(thread.n)}  ${pad(thread.status === "resolved" ? "resolved" : "open", 8)}  ${anchor.label || "the page"}`,
    );
    if (anchor.quote) out.push(`    quoting: ${pyStr(anchor.quote)}`);
    for (const message of [thread, ...asThreads(thread.replies)]) {
      const who = message.by === "claude" ? "Claude" : user;
      const said = lines(String(message.body || ""));
      const [first = "", ...rest] = said.length ? said : [""];
      out.push(`    ${who}: ${first}`, ...rest.map((line) => `    ${" ".repeat(Array.from(who).length)}  ${line}`));
    }
  }
  if (opens.length) {
    out.push(`\nAnswer one:   artifact comments ${slug} --reply <n> "..."`);
    out.push(`Close one:    artifact comments ${slug} --resolve <n> "what changed"`);
  }
  return out.join("\n");
}

export function reply({ path, n, body, resolve }: { path: string; n: string; body: string; resolve: boolean }): Thread {
  const doc = readDoc(path);
  const thread = doc.threads.find((t) => pyStr(t.n) === n);
  if (!thread) throw new Refusal(`no comment #${n} on this artifact`);
  if (body) {
    const replies = asThreads(thread.replies);
    thread.replies = [...replies, { id: `c${replies.length + 1}${n}`, by: "claude", at: now(), body }];
  }
  if (resolve) {
    thread.status = "resolved";
    thread.resolvedBy = "claude";
  }
  thread.updated = now();
  doc.updated = now();
  writeDoc(path, doc);
  return thread;
}
