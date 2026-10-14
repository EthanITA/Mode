import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { Agent as HttpAgent, get as httpGet, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, get as httpsGet } from "node:https";
import { basename, dirname, join } from "node:path";
import { readTextSafe } from "../files.ts";
import { sidecarHome } from "../mode/paths.ts";

/** One site the sidecar has opened, whose file is that entry's "path" for the server and the CLI alike. */
export interface WebRecord {
  port: number;
  slug: string;
  threads: unknown[];
  title?: string;
  updated: string;
  url: string;
  v: 1;
}

export interface OpenedRecord {
  isNew: boolean;
  record: WebRecord;
}

// Outlives the entry, so a site opened again finds its cookies and storage under the same proxy origin.
interface SiteOrigin {
  port: number;
  slug: string;
}

const FIRST_PORT = 47481;
// The slug is the proxy's host label, and a DNS label past 63 characters never resolves.
const LABEL_MAX = 63;
export function webHome(): string {
  return join(sidecarHome(), "web");
}

export function recordPath(slug: string): string {
  return join(webHome(), `${slug}.json`);
}

export function isWebRecord(path: string): boolean {
  return dirname(path) === webHome() && path.endsWith(".json");
}

const originsPath = (): string => join(sidecarHome(), "web-origins.json");

const HOPS = 5;
const LANDING_MS = 10_000;
const bare = (host: string): string => host.toLowerCase().replace(/^www\./, "");

// Node gives up on each address after 250ms, which no connect beats on a slow link, so every site would read as down.
const PATIENT = { autoSelectFamilyAttemptTimeout: 5000, keepAlive: true, maxFreeSockets: 64, maxSockets: 256 };
export const siteAgents = { http: new HttpAgent(PATIENT), https: new HttpsAgent(PATIENT) };

// google.com and www.google.com, on http or https, are one site and so one entry.
function siteOf(url: URL): string {
  return `${bare(url.hostname)}${url.port ? `:${url.port}` : ""}`;
}

function answer(url: URL, signal: AbortSignal): Promise<{ location?: string; status: number }> {
  return new Promise((resolve, reject) => {
    const done = (res: IncomingMessage): void => {
      res.destroy();
      resolve({ location: res.headers.location, status: res.statusCode ?? 0 });
    };
    const req =
      url.protocol === "https:"
        ? httpsGet(url, { agent: siteAgents.https, signal }, done)
        : httpGet(url, { agent: siteAgents.http, signal }, done);
    req.on("error", reject);
  });
}

export async function landing(url: URL): Promise<URL> {
  let at = url;
  const signal = AbortSignal.timeout(LANDING_MS);
  try {
    for (let hop = 0; hop < HOPS; hop += 1) {
      const { location, status } = await answer(at, signal);
      if (status < 300 || status >= 400 || !location) return at;
      const next = new URL(location, at);
      // A move within the origin is the frame's to follow, and one off the web leads to no site.
      if (next.origin === at.origin || !/^https?:$/.test(next.protocol)) return at;
      at = next;
    }
  } catch {}
  return at;
}

export function webSlug(url: URL): string {
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const tail = `-${port}--${createHash("sha1").update(url.origin).digest("hex").slice(0, 6)}`;
  const host = url.hostname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${(host || "site").slice(0, LABEL_MAX - tail.length).replace(/-+$/, "")}${tail}`;
}

const SLUG = /^[a-z0-9-]+$/;

function recordOf(raw: unknown): WebRecord | undefined {
  if (typeof raw !== "object" || !raw) return undefined;
  const rec = raw as Partial<WebRecord>;
  if (typeof rec.slug !== "string" || !SLUG.test(rec.slug)) return undefined;
  if (typeof rec.url !== "string" || !URL.canParse(rec.url) || typeof rec.port !== "number") return undefined;
  return {
    port: rec.port,
    slug: rec.slug,
    threads: Array.isArray(rec.threads) ? rec.threads : [],
    title: typeof rec.title === "string" && rec.title ? rec.title : undefined,
    updated: typeof rec.updated === "string" ? rec.updated : "",
    url: rec.url,
    v: 1,
  };
}

function parse(text: string | undefined): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

export function readRecord(slug: string): WebRecord | undefined {
  return SLUG.test(slug) ? recordOf(parse(readTextSafe(recordPath(slug)))) : undefined;
}

export function listRecords(): WebRecord[] {
  let names: string[];
  try {
    names = readdirSync(webHome());
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => readRecord(basename(name, ".json")))
    .filter((record): record is WebRecord => Boolean(record));
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value)}\n`);
  renameSync(tmp, file);
}

function origins(): Record<string, SiteOrigin> {
  const raw = parse(readTextSafe(originsPath()));
  return typeof raw === "object" && raw ? (raw as Record<string, SiteOrigin>) : {};
}

function remember(record: WebRecord): void {
  const all = origins();
  const site = siteOf(new URL(record.url));
  if (all[site]?.port === record.port && all[site]?.slug === record.slug) return;
  writeJson(originsPath(), { ...all, [site]: { port: record.port, slug: record.slug } });
}

export function writeRecord(record: WebRecord): void {
  writeJson(recordPath(record.slug), record);
  remember(record);
}

/** The lowest proxy port no site holds, skipping any the caller found taken by something else. */
export function freePort(skip: number[] = []): number {
  const held = [...listRecords(), ...Object.values(origins())].map((one) => one.port);
  const taken = new Set([...held, ...skip]);
  let port = FIRST_PORT;
  while (taken.has(port)) port += 1;
  return port;
}

// Two entries of one site predate one site meaning one entry, and the one with the most on it is the one kept.
function byWeight(a: WebRecord, b: WebRecord): number {
  return (
    b.threads.length - a.threads.length ||
    Number(Boolean(b.title)) - Number(Boolean(a.title)) ||
    b.updated.localeCompare(a.updated)
  );
}

function siteEntry(url: URL): WebRecord | undefined {
  const site = siteOf(url);
  return listRecords()
    .filter((one) => siteOf(new URL(one.url)) === site)
    .sort(byWeight)[0];
}

export interface OpenRecordOptions {
  title?: string;
  /** Typed by someone, so a site not held yet is chased to the last stop of its redirects. */
  typed?: boolean;
  url: URL;
}

function where({ held, typed, url }: { held?: WebRecord; typed: boolean; url: URL }): Promise<URL> | URL {
  if (!typed) return url;
  // A held site skips the probe, which has none of the frame's cookies and would land on its login.
  if (held) return new URL(`${url.pathname}${url.search}${url.hash}`, new URL(held.url).origin);
  return landing(url);
}

/** Reuses the site's entry, so its port and with it the site's storage survive, and remembers where it was opened. */
export async function openRecord({ title, typed = false, url }: OpenRecordOptions): Promise<OpenedRecord> {
  const at = await where({ held: siteEntry(url), typed, url });
  const held = siteEntry(at);
  const home = held ? undefined : origins()[siteOf(at)];
  const record: WebRecord = {
    port: held?.port ?? home?.port ?? freePort(),
    slug: held?.slug ?? home?.slug ?? webSlug(at),
    threads: held?.threads ?? [],
    title: title || held?.title,
    updated: new Date().toISOString(),
    url: at.href,
    v: 1,
  };
  writeRecord(record);
  return { isNew: !held, record };
}

const idOf = (thread: unknown): string =>
  typeof thread === "object" && thread && "id" in thread ? String(thread.id) : JSON.stringify(thread);

export function mergeSites(): { from: string; to: string }[] {
  const sites = new Map<string, WebRecord[]>();
  for (const one of listRecords()) {
    const site = siteOf(new URL(one.url));
    sites.set(site, [...(sites.get(site) ?? []), one]);
  }
  const merged: { from: string; to: string }[] = [];
  for (const group of sites.values()) {
    const [kept, ...rest] = group.sort(byWeight);
    if (!kept || !rest.length) continue;
    const ids = new Set(kept.threads.map(idOf));
    const threads = [...kept.threads, ...rest.flatMap((one) => one.threads).filter((thread) => !ids.has(idOf(thread)))];
    writeRecord({ ...kept, threads, title: kept.title || rest.find((one) => one.title)?.title });
    for (const gone of rest) {
      rmSync(recordPath(gone.slug), { force: true });
      merged.push({ from: gone.slug, to: kept.slug });
    }
  }
  return merged;
}

/** Deletes the entry and its threads, while its origin stays remembered, so the site opened again finds its storage. */
export function removeRecord(slug: string): WebRecord | undefined {
  const gone = readRecord(slug);
  if (!gone) return undefined;
  remember(gone);
  rmSync(recordPath(slug), { force: true });
  return gone;
}

export function restoreRecord(raw: unknown): WebRecord | undefined {
  const back = recordOf(raw);
  if (back) writeRecord(back);
  return back;
}
