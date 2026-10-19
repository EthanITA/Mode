import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { basename, dirname, join } from "node:path";
import { getDomainWithoutSuffix } from "tldts";
import type { WebTrail } from "../../shared/types/web.ts";
import { Trail } from "../../shared/utils/trail.ts";
import { readTextSafe } from "../files.ts";
import { sidecarHome } from "../mode/paths.ts";

/** One web artifact, a tab of its own, whose file is that entry's "path" for the server and the CLI alike. */
export interface WebRecord {
  /** The address it was opened on, which a link or the CLI opening that address again finds it by. */
  opened?: string;
  slug: string;
  threads: unknown[];
  title?: string;
  trail?: WebTrail;
  updated: string;
  /** The page it shows now, on whichever site it has gone to. */
  url: string;
  v: 2;
}

export interface OpenedRecord {
  isNew: boolean;
  record: WebRecord;
}

/** Where every web artifact is served, one port so a site's storage is the same in all of them. */
export const PROXY_PORT = 47481;
const NAME_MAX = 24;
export function webHome(): string {
  return join(sidecarHome(), "web");
}

export function recordPath(slug: string): string {
  return join(webHome(), `${slug}.json`);
}

export function isWebRecord(path: string): boolean {
  return dirname(path) === webHome() && path.endsWith(".json");
}

// Node gives up on each address after 250ms, which no connect beats on a slow link, so every site would read as down.
const PATIENT = { autoSelectFamilyAttemptTimeout: 5000, keepAlive: true, maxFreeSockets: 64, maxSockets: 256 };
export const siteAgents = { http: new HttpAgent(PATIENT), https: new HttpsAgent(PATIENT) };

export function webSlug(url: URL): string {
  const name = (getDomainWithoutSuffix(url.hostname) || url.hostname)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_MAX)
    .replace(/-+$/, "");
  return `${name || "site"}${url.port ? `-${url.port}` : ""}-${randomBytes(3).toString("hex")}`;
}

const SLUG = /^[a-z0-9-]+$/;

// The hash only scrolls, so an address with one is the page without it.
function addressOf(href: string): string {
  const at = new URL(href);
  return `${at.origin}${at.pathname}${at.search}`;
}

// A thread from when an entry was one site kept only its path, which was always on the entry's own origin.
function placed(thread: unknown, origin: string): unknown {
  if (typeof thread !== "object" || !thread) return thread;
  const { anchor } = thread as { anchor?: { page?: unknown } };
  if (typeof anchor?.page !== "string" || !anchor.page.startsWith("/")) return thread;
  return { ...thread, anchor: { ...anchor, page: `${origin}${anchor.page}` } };
}

function recordOf(raw: unknown): WebRecord | undefined {
  if (typeof raw !== "object" || !raw) return undefined;
  const rec = raw as Partial<Omit<WebRecord, "v">> & { v?: number };
  if (typeof rec.slug !== "string" || !SLUG.test(rec.slug)) return undefined;
  if (typeof rec.url !== "string" || !URL.canParse(rec.url)) return undefined;
  const threads = Array.isArray(rec.threads) ? rec.threads : [];
  const origin = new URL(rec.url).origin;
  return {
    opened: typeof rec.opened === "string" && URL.canParse(rec.opened) ? rec.opened : undefined,
    slug: rec.slug,
    threads: rec.v === 2 ? threads : threads.map((thread) => placed(thread, origin)),
    title: typeof rec.title === "string" && rec.title ? rec.title : undefined,
    trail: Trail.of(rec.trail),
    updated: typeof rec.updated === "string" ? rec.updated : "",
    url: rec.url,
    v: 2,
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

export function writeRecord(record: WebRecord): void {
  const file = recordPath(record.slug);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record)}\n`);
  renameSync(tmp, file);
}

export interface OpenRecordOptions {
  /** Artifacts that may be reused, a conversation's own, so a link opened again lands on the tab already showing it. */
  reuse?: string[];
  title?: string;
  url: URL;
}

export interface FindRecordOptions {
  among: string[];
  url: URL;
}

// A tab that has since gone to another page still holds the address it was opened on.
export function findRecord({ among, url }: FindRecordOptions): WebRecord | undefined {
  const at = addressOf(url.href);
  return among
    .map(readRecord)
    .find((one) => !!one && (addressOf(one.url) === at || (!!one.opened && addressOf(one.opened) === at)));
}

/** A new web artifact, a tab of its own, unless one in reuse already shows or was opened on the address. */
export function openRecord({ reuse = [], title, url }: OpenRecordOptions): OpenedRecord {
  const held = findRecord({ among: reuse, url });
  const now = new Date().toISOString();
  if (held) {
    const moved = addressOf(held.url) !== addressOf(url.href);
    const record: WebRecord = moved
      ? {
          ...held,
          trail: Trail.arrive(held.trail ?? { at: 0, urls: [] }, { how: "push", url: url.href }),
          updated: now,
          url: url.href,
        }
      : held;
    if (moved) writeRecord(record);
    return { isNew: false, record };
  }
  const record: WebRecord = {
    opened: url.href,
    slug: webSlug(url),
    threads: [],
    ...(title ? { title } : {}),
    updated: now,
    url: url.href,
    v: 2,
  };
  writeRecord(record);
  return { isNew: true, record };
}

export interface PageUpdate {
  title?: string;
  trail?: WebTrail;
  url: URL;
}

/** Where the artifact's page went, so the list and a reopen land where the person left off. */
export function updateRecord(slug: string, { title, trail, url }: PageUpdate): WebRecord | undefined {
  const held = readRecord(slug);
  if (!held) return undefined;
  const record: WebRecord = {
    ...held,
    title: title || held.title,
    trail: trail ?? held.trail,
    updated: new Date().toISOString(),
    url: url.href,
  };
  writeRecord(record);
  return record;
}

/** Deletes the artifact and its threads; the session every artifact shares stays. */
export function removeRecord(slug: string): WebRecord | undefined {
  const gone = readRecord(slug);
  if (!gone) return undefined;
  rmSync(recordPath(slug), { force: true });
  return gone;
}

export function restoreRecord(raw: unknown): WebRecord | undefined {
  const back = recordOf(raw);
  if (back) writeRecord(back);
  return back;
}
