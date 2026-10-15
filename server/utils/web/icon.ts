import { proxyFetch } from "httpxy";
import { siteAgents } from "../../../lib/web/records.ts";
import { reachOf } from "./proxy.ts";

export interface SiteIcon {
  body: Uint8Array;
  type: string;
}

export interface IconInput {
  origin: string;
  /** The sidecar browser's own, so the site answers the lookup as it would that browser's tab. */
  userAgent?: string;
}

interface Kept {
  icon: Promise<SiteIcon | undefined>;
  until: number;
}

const HOPS = 5;
const WAIT = 4000;
const HEAD_MAX = 512 * 1024;
const ICON_MAX = 256 * 1024;
const HIT_FOR = 24 * 60 * 60 * 1000;
// Short, so a dev server started after its address was typed still gets its icon.
const MISS_FOR = 60 * 1000;
const KEPT_MAX = 256;
const LINK = /<link\b[^>]*>/gi;
const ATTR = /\s([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const SIGNATURES: [string, number[]][] = [
  ["image/x-icon", [0, 0, 1, 0]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
];

const kept = new Map<string, Kept>();

async function fetchFollowing(start: URL, { accept, userAgent }: { accept: string; userAgent?: string }) {
  let at = start;
  for (let hop = 0; hop <= HOPS; hop += 1) {
    const reach = await reachOf(at.hostname);
    const headers = new Headers({ accept });
    if (userAgent) headers.set("user-agent", userAgent);
    const response = await proxyFetch(
      at.origin,
      at,
      { headers, redirect: "manual" },
      {
        agent: at.protocol === "https:" ? siteAgents.https : siteAgents.http,
        changeOrigin: true,
        ssl: reach === "loopback" ? { rejectUnauthorized: false } : undefined,
        timeout: WAIT,
      },
    ).catch(() => undefined);
    const to = response?.headers.get("location");
    if (!response || response.status < 300 || response.status >= 400 || !to) return response && { at, response };
    await response.body?.cancel();
    at = new URL(to, at);
    if (at.protocol !== "http:" && at.protocol !== "https:") return undefined;
  }
  return undefined;
}

// Stops at the cap or once the head has closed, since the icon links never sit in a page's body.
async function readUpTo(response: Response, { max, until }: { max: number; until?: string }): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const decoder = new TextDecoder();
  let tail = "";
  while (reader && size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (!until) continue;
    const seen = tail + decoder.decode(value, { stream: true });
    if (seen.includes(until)) break;
    tail = seen.slice(-until.length);
  }
  await reader?.cancel();
  return Buffer.concat(chunks).subarray(0, max);
}

// The page agent's own pick, so the typed address and the loaded page show the same icon.
function linkedIcon(html: string, page: URL): URL | undefined {
  const links = [...html.matchAll(LINK)].map(([tag]) => {
    const attrs: Record<string, string> = Object.fromEntries(
      [...tag.matchAll(ATTR)].map(([, name = "", ...value]) => [name.toLowerCase(), value.find(Boolean) ?? ""]),
    );
    return { href: attrs.href?.replaceAll("&amp;", "&"), rel: (attrs.rel ?? "").toLowerCase().split(/\s+/) };
  });
  const found =
    links.find((link) => link.href && link.rel.includes("icon")) ??
    links.find((link) => link.href && link.rel.includes("apple-touch-icon"));
  try {
    return found?.href ? new URL(found.href, page) : undefined;
  } catch {
    return undefined;
  }
}

// A favicon is often served as octet-stream or text, so the bytes decide when the header doesn't say image.
function imageTypeOf(declared: string, body: Uint8Array): string | undefined {
  const type = declared.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!body.byteLength) return undefined;
  if (type.startsWith("image/")) return type;
  const sniffed = SIGNATURES.find(([, magic]) => magic.every((byte, i) => body[i] === byte))?.[0];
  if (sniffed) return sniffed;
  const head = new TextDecoder().decode(body.subarray(0, 512)).trimStart();
  return /^(<\?xml[^>]*>\s*)?<svg\b/i.test(head) ? "image/svg+xml" : undefined;
}

async function iconAt(url: URL, userAgent?: string): Promise<SiteIcon | undefined> {
  const got = await fetchFollowing(url, { accept: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8", userAgent });
  if (!got?.response.ok) {
    await got?.response.body?.cancel();
    return undefined;
  }
  const body = await readUpTo(got.response, { max: ICON_MAX });
  const type = imageTypeOf(got.response.headers.get("content-type") ?? "", body);
  return type ? { body, type } : undefined;
}

async function lookUp({ origin, userAgent }: IconInput): Promise<SiteIcon | undefined> {
  const root = new URL("/", origin);
  const got = await fetchFollowing(root, { accept: "text/html,application/xhtml+xml", userAgent });
  const declared = got?.response.headers.get("content-type");
  const isHtml = !!got?.response.ok && (!declared || declared.includes("html"));
  const html =
    got && isHtml ? new TextDecoder().decode(await readUpTo(got.response, { max: HEAD_MAX, until: "</head>" })) : "";
  if (!isHtml) await got?.response.body?.cancel();
  const linked = got && html ? linkedIcon(html, got.at) : undefined;
  const isWeb = linked?.protocol === "http:" || linked?.protocol === "https:";
  const fromLink = linked && isWeb ? await iconAt(linked, userAgent) : undefined;
  return fromLink ?? iconAt(new URL("/favicon.ico", got?.at ?? root), userAgent);
}

/** A site's favicon, looked up once per origin and kept, so typing an address fetches it a single time. */
export function siteIcon({ origin, userAgent }: IconInput): Promise<SiteIcon | undefined> {
  const held = kept.get(origin);
  if (held && held.until > Date.now()) return held.icon;
  if (kept.size >= KEPT_MAX) kept.delete(kept.keys().next().value ?? "");
  const icon = lookUp({ origin, userAgent }).catch(() => undefined);
  const entry: Kept = { icon, until: Date.now() + WAIT * 4 };
  kept.set(origin, entry);
  void icon.then((found) => (entry.until = Date.now() + (found ? HIT_FOR : MISS_FOR)));
  return icon;
}
