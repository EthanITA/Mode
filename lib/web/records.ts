import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
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

const HOPS = 5;
const bare = (host: string): string => host.toLowerCase().replace(/^www\./, "");

// Only the host with or without www, or its https upgrade, so an app that bounces to a login provider keeps its own entry.
export function isSameSite(from: URL, to: URL): boolean {
  if (bare(from.hostname) !== bare(to.hostname)) return false;
  return from.protocol === to.protocol ? from.port === to.port : to.protocol === "https:" && !to.port;
}

/** Where the site really answers: google.com lives at www.google.com, and a frame can't follow it there itself. */
export async function landing(url: URL): Promise<URL> {
  let at = url;
  try {
    for (let hop = 0; hop < HOPS; hop += 1) {
      const response = await fetch(at, { redirect: "manual", signal: AbortSignal.timeout(4000) });
      void response.body?.cancel();
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) return at;
      const next = new URL(location, at);
      if (next.origin === at.origin || !isSameSite(at, next)) return at;
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

function parse(text: string | undefined): WebRecord | undefined {
  if (!text) return undefined;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || !raw) return undefined;
    const rec = raw as Partial<WebRecord>;
    if (typeof rec.slug !== "string" || typeof rec.url !== "string" || typeof rec.port !== "number") return undefined;
    return {
      port: rec.port,
      slug: rec.slug,
      threads: Array.isArray(rec.threads) ? rec.threads : [],
      title: typeof rec.title === "string" && rec.title ? rec.title : undefined,
      updated: typeof rec.updated === "string" ? rec.updated : "",
      url: rec.url,
      v: 1,
    };
  } catch {
    return undefined;
  }
}

export function readRecord(slug: string): WebRecord | undefined {
  return /^[a-z0-9-]+$/.test(slug) ? parse(readTextSafe(recordPath(slug))) : undefined;
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

/** The lowest proxy port no other entry holds, skipping any the caller found taken by something else. */
export function freePort(skip: number[] = []): number {
  const taken = new Set([...listRecords().map((record) => record.port), ...skip]);
  let port = FIRST_PORT;
  while (taken.has(port)) port += 1;
  return port;
}

/** Reuses the site's entry, so its port and with it the site's storage survive, and remembers where it was opened. */
export function openRecord({ title, url }: { title?: string; url: URL }): WebRecord {
  const slug = webSlug(url);
  const held = readRecord(slug);
  const record: WebRecord = {
    port: held?.port ?? freePort(),
    slug,
    threads: held?.threads ?? [],
    title: title || held?.title,
    updated: new Date().toISOString(),
    url: url.href,
    v: 1,
  };
  writeRecord(record);
  return record;
}
