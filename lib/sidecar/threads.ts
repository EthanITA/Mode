import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { lines, pad, pyJson, pyStr } from "../text.ts";
import { isWebRecord, readRecord, writeRecord } from "../web/records.ts";
import {
  hasLegacyBlock,
  isStoredDocument,
  MD_SEED,
  readComments,
  withoutLegacyBlock,
  writeComments,
} from "./comments.ts";
import { SidecarConfig } from "./config.ts";
import { Sidecar } from "./paths.ts";
import { Refusal } from "./refusal.ts";

type Payload = { [key: string]: unknown };
export type Thread = Payload & { id?: unknown; n?: unknown; at?: unknown; updated?: unknown; replies?: unknown };
export type Doc = Payload & { threads: Thread[] };

const SEED = /(<script type="application\/json" id="rv-seed">)([\s\S]*?)(<\/script>)/;

const isRecord = (value: unknown): value is Payload => typeof value === "object" && !!value && !Array.isArray(value);
const stem = (path: string): string => basename(path, extname(path));
const seedOf = (path: string): RegExp => (path.endsWith(".md") ? MD_SEED : SEED);
const readPage = (path: string): string => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
const asThreads = (value: unknown): Thread[] => (Array.isArray(value) ? value : []) as Thread[];
const isStored = (path: string): boolean => isStoredDocument(path, Sidecar.artifacts());

const now = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const read = (path: string): Doc => {
  if (isWebRecord(path)) {
    const site = readRecord(stem(path));
    return { v: 1, slug: stem(path), url: site?.url, threads: asThreads(site?.threads) };
  }
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
};

const write = (path: string, doc: Doc): void => {
  if (isWebRecord(path)) {
    const site = readRecord(stem(path));
    if (!site) throw new Refusal(`no web entry at ${path}`);
    return writeRecord({ ...site, threads: doc.threads });
  }
  const text = readPage(path);
  if (isStored(path)) {
    writeComments(path, doc);
    if (hasLegacyBlock(text)) writeFileSync(path, withoutLegacyBlock(text));
    return;
  }
  let body = pyJson(doc, false);
  if (path.endsWith(".md")) {
    body = body.replaceAll("-->", "--\\u003e");
    if (!MD_SEED.test(text)) return writeFileSync(path, `${text.replace(/\n+$/, "")}\n\n<!-- rv:seed\n${body}\n-->\n`);
  } else if (!SEED.test(text)) {
    throw new Refusal(`${basename(path)} carries no review layer. Run: artifact review ${stem(path)}`);
  }
  writeFileSync(
    path,
    text.replace(seedOf(path), (_, open: string, __, close: string) => open + body + close),
  );
};

const byAt = (a: Thread, b: Thread): number => {
  const [x, y] = [String(a.at || ""), String(b.at || "")];
  return x < y ? -1 : x > y ? 1 : 0;
};

const merge = (a: Thread[], b: Thread[]): Thread[] => {
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
};

const ingest = (path: string, incoming: Payload): [added: number, total: number] => {
  const doc = read(path);
  const before = doc.threads.length;
  doc.threads = merge(doc.threads, asThreads(incoming.threads));
  doc.updated = now();
  write(path, doc);
  return [doc.threads.length - before, doc.threads.length];
};

const render = (doc: Doc, slug: string): string => {
  const threads = doc.threads;
  const opens = threads.filter((t) => t.status !== "resolved");
  const out = [`${slug}  ${opens.length} open, ${threads.length - opens.length} resolved`];
  if (!threads.length) return [...out, "\nNo comments. Nothing is blocking you."].join("\n");
  const user = SidecarConfig.read().user || "User";
  for (const thread of threads) {
    const anchor = isRecord(thread.anchor) ? thread.anchor : {};
    const page = anchor.page ? ` on ${pyStr(anchor.page)}` : "";
    out.push(
      `\n#${pyStr(thread.n)}  ${pad(thread.status === "resolved" ? "resolved" : "open", 8)}  ${anchor.label || "the page"}${page}`,
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
    out.push(`\nAnswer one:   sidecar comments ${slug} --reply <n> "..."`);
    out.push(`Close one:    sidecar comments ${slug} --resolve <n> "what changed"`);
  }
  return out.join("\n");
};

const reply = ({ path, n, body, resolve }: { path: string; n: string; body: string; resolve: boolean }): Thread => {
  const doc = read(path);
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
  write(path, doc);
  return thread;
};

export const Threads = { ingest, read, render, reply };
