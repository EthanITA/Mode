import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type RequestListener, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { BlockList, isIP } from "node:net";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import {
  createApp,
  eventHandler,
  getRequestURL,
  type H3Event,
  sendWebResponse,
  toNodeListener,
  toWebRequest,
} from "h3";
import { proxyFetch, proxyUpgrade } from "httpxy";
import { getDomain } from "tldts";
import { pluginRoot } from "../../../lib/mode/paths.ts";
import { type ProxyPlace, WebHost } from "../../../lib/web/host.ts";
import { CHANNEL } from "../../../lib/web/page/protocol.ts";
import { siteAgents } from "../../../lib/web/records.ts";

export interface ProxyTarget {
  /** The origin the sidecar's page is on, which is the only one the injected agent answers. */
  parent: string;
  port: number;
  /** The artifact's slug, which every host the proxy serves is named under. */
  slug: string;
}

interface Running {
  generation: symbol;
  parents: Set<string>;
  port: number;
  ready: Promise<void>;
  servers: Server[];
  slug: string;
  // An upgraded socket leaves the server's books, so close would wait on an open HMR socket forever.
  sockets: Set<Duplex>;
}

/** How close to this machine a host is, in Chrome's Private Network Access order. */
export type Reach = "loopback" | "private" | "public";

const GENERATION = Symbol("web-proxy");
// IPv4 must bind, since Chrome's *.localhost lookup tries it; a machine without IPv6 just serves one.
const HOSTS = ["127.0.0.1", "::1"];
const OWN = "/__sidecar/";
const PAGE_FILE = /^\/__sidecar\/([a-z]+)\.ts$/;
const DROPPED = ["content-security-policy", "content-security-policy-report-only", "x-frame-options"];
const PERMANENT: Record<number, number> = { 301: 302, 308: 307 };
const META_CSP = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;
const NONCE = /<script\b[^>]*\snonce\s*=\s*["']?([^"'\s>]+)/i;
const RANK: Record<Reach, number> = { loopback: 2, private: 1, public: 0 };

const LOOPBACK = new BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8);
LOOPBACK.addAddress("::1", "ipv6");
const PRIVATE = new BlockList();
for (const [net, bits] of [
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
] as const)
  PRIVATE.addSubnet(net, bits);
PRIVATE.addSubnet("fc00::", 7, "ipv6");
PRIVATE.addSubnet("fe80::", 10, "ipv6");

// Process-wide, so a dev reload that re-imports this module still finds the proxies the last copy opened.
const scope = globalThis as typeof globalThis & {
  sidecarWebKnown?: Map<string, Reach>;
  sidecarWebProxies?: Map<number, Running>;
};
const running = (scope.sidecarWebProxies ??= new Map<number, Running>());
const reaches = new Map<string, Promise<Reach>>();
// Kept with the proxies, since the API fence reads it for a page that loaded before the reload.
const known = (scope.sidecarWebKnown ??= new Map<string, Reach>());

function reachOfAddress(address: string): Reach {
  const family = isIP(address) === 6 ? "ipv6" : "ipv4";
  if (LOOPBACK.check(address, family)) return "loopback";
  return PRIVATE.check(address, family) ? "private" : "public";
}

async function resolveReach(name: string): Promise<Reach> {
  if (name === "localhost" || name.endsWith(".localhost")) return "loopback";
  if (isIP(name)) return reachOfAddress(name);
  if (name.endsWith(".local")) return "private";
  try {
    const found = await lookup(name, { all: true });
    // The closest address decides, since a connect may land on any of them.
    return found
      .map(({ address }) => reachOfAddress(address))
      .reduce<Reach>((best, one) => (RANK[one] > RANK[best] ? one : best), "public");
  } catch {
    return "public";
  }
}

export function reachOf(host: string): Promise<Reach> {
  const name = host.replace(/^\[|\]$/g, "").toLowerCase();
  let held = reaches.get(name);
  if (!held) {
    held = resolveReach(name).then((reach) => {
      known.set(name, reach);
      return reach;
    });
    reaches.set(name, held);
  }
  return held;
}

function upstreamOf(raw: string | URL, held: Pick<Running, "slug">): { base: string; url: URL } | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const base = WebHost.baseIn({ host: url.hostname, slug: held.slug });
  const to = base && WebHost.upstream(url, base);
  return base && to ? { base, url: to } : undefined;
}

const BASE64URL: Record<string, string> = { "+": "-", "-": "+", "/": "_", _: "/", "=": ".", ".": "=" };

export interface Captcha {
  proxy: string;
  site: string;
  url: URL;
}

// reCAPTCHA reads the page's origin from co and refuses a localhost one, so it is told the site's own.
export function captchaFor(target: URL, held: Pick<Running, "slug">): Captcha | undefined {
  const co = /^\/recaptcha\//.test(target.pathname) ? target.searchParams.get("co") : undefined;
  let proxy: string;
  try {
    proxy = co ? atob(co.replace(/[-_.]/g, (c) => BASE64URL[c] ?? c)) : "";
  } catch {
    return undefined;
  }
  const page = proxy ? upstreamOf(proxy, held)?.url : undefined;
  if (!page) return undefined;
  const site = `${page.protocol}//${page.hostname}:${page.port || (page.protocol === "https:" ? "443" : "80")}`;
  const own = btoa(site).replace(/[+/=]/g, (c) => BASE64URL[c] ?? c);
  const search = target.search.replace(/([?&]co=)[^&]*/, `$1${own}`);
  return { proxy: new URL(proxy).origin, site, url: new URL(`${target.pathname}${search}`, target.origin) };
}

/** True for a page of a site off this machine, which must never reach the sidecar's own API. */
export function isFencedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  let port: number;
  try {
    port = Number(new URL(origin).port);
  } catch {
    return false;
  }
  const held = running.get(port);
  if (!held) return false;
  const site = upstreamOf(origin, held)?.url;
  return !site || known.get(site.hostname.replace(/^\[|\]$/g, "")) !== "loopback";
}

function originOf(raw: string | undefined): string | undefined {
  return raw ? new URL(raw).origin : undefined;
}

// A session cookie dies with the browser, so a site's login would too; 400 days is the longest Chrome keeps one.
const LASTING = "; Max-Age=34560000";

// The site's domain gets the artifact's tail, so its other hosts share the cookie here as they would in a tab.
export function keptCookie(cookie: string, { place, target }: { place: ProxyPlace; target: URL }): string {
  const domain = /;\s*domain\s*=\s*\.?([^;]*)/i.exec(cookie)?.[1]?.trim().toLowerCase();
  const own = cookie.replace(/;\s*domain\s*=[^;]*/gi, "");
  const lasting = /;\s*(expires|max-age)\s*=/i.test(own) ? own : `${own}${LASTING}`;
  const host = target.hostname.toLowerCase();
  const proxy = WebHost.proxied(target, place);
  const isOwn = !!domain && (host === domain || host.endsWith(`.${domain}`)) && !!getDomain(domain);
  if (!proxy || !isOwn) return lasting;
  return `${lasting}; Domain=${domain}${new URL(proxy).hostname.slice(host.length)}`;
}

const TAG = /<(base|form|iframe|link|script)\b[^>]*>|<[a-z][a-z0-9-]*\b[^>]*\scrossorigin\b[^>]*>/gi;
const ATTR = /(\s(?:action|href|src)\s*=\s*)(["'])(.*?)\2/gi;
const REFRESH = /(<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url\s*=\s*)([^"'\s>]+)/gi;

function proxiedText(raw: string, { place, target }: { place: ProxyPlace; target: URL }): string {
  const value = raw.replace(/&amp;/g, "&");
  if (!/^(https?:)?\/\//i.test(value)) return raw;
  const to = WebHost.proxied(new URL(value, target), place);
  return to ? to.replace(/&/g, "&amp;") : raw;
}

// Only absolute addresses move, since a relative one already resolves against the proxy host.
function rewriteTags(html: string, at: { place: ProxyPlace; target: URL }): string {
  return html
    .replace(TAG, (tag) =>
      tag.replace(
        ATTR,
        (_all, head: string, quote: string, value: string) => `${head}${quote}${proxiedText(value, at)}${quote}`,
      ),
    )
    .replace(REFRESH, (_all, head: string, value: string) => `${head}${proxiedText(value, at)}`);
}

interface InjectInput {
  parents: Set<string>;
  place: ProxyPlace;
  target: URL;
}

function inject(html: string, { parents, place, target }: InjectInput): string {
  const page = rewriteTags(html.replace(META_CSP, ""), { place, target });
  // A page that checks its own scripts' nonce, as reddit's does, would refuse two scripts without one.
  const nonce = NONCE.exec(page)?.[1];
  const sealed = nonce ? ` nonce="${nonce}"` : "";
  const tags =
    `<script${sealed} src="${OWN}bootstrap.ts?base=${encodeURIComponent(place.base)}"></script>` +
    `<script${sealed} type="module" src="${OWN}agent.ts?parent=${encodeURIComponent([...parents].join(","))}"></script>`;
  const at = /<head\b[^>]*>/i.exec(page) ?? /<html\b[^>]*>/i.exec(page) ?? /<!doctype[^>]*>/i.exec(page);
  const end = at ? at.index + at[0].length : 0;
  return `${page.slice(0, end)}${tags}${page.slice(end)}`;
}

// A site off this machine runs on a loopback origin here, so its calls stay on the proxy and the open web.
function fenceOf({ base, port }: ProxyPlace): string {
  const proxies = `http://*.${base}:${port}`;
  return `connect-src 'self' https: wss: ${proxies} ws://*.${base}:${port}; form-action 'self' https: ${proxies}`;
}

export interface RewriteInput {
  captcha?: Captcha;
  isHead: boolean;
  parents: Set<string>;
  place: ProxyPlace;
  reach: Reach;
  response: Response;
  target: URL;
}

export async function rewriteResponse({
  captcha,
  isHead,
  parents,
  place,
  reach,
  response,
  target,
}: RewriteInput): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const name of DROPPED) headers.delete(name);
  const location = headers.get("location");
  if (location) headers.set("location", WebHost.proxied(new URL(location, target), place) ?? location);
  const allowed = headers.get("access-control-allow-origin");
  if (allowed && /^https?:\/\//i.test(allowed))
    headers.set("access-control-allow-origin", originOf(WebHost.proxied(allowed, place)) ?? allowed);
  const refresh = headers.get("refresh");
  if (refresh)
    headers.set(
      "refresh",
      refresh.replace(
        /(url\s*=\s*)(\S+)/i,
        (_all, head: string, value: string) => `${head}${proxiedText(value, { place, target })}`,
      ),
    );
  headers.delete("set-cookie");
  for (const cookie of response.headers.getSetCookie())
    headers.append("set-cookie", keptCookie(cookie, { place, target }));
  if (reach === "public") headers.set("content-security-policy", fenceOf(place));
  // A browser keeps a permanent redirect forever, so one passed on once would send the frame past the proxy for good.
  const status = PERMANENT[response.status] ?? response.status;
  if (status !== response.status) headers.set("cache-control", "no-store");
  const init = { headers, status, statusText: status === response.status ? response.statusText : "" };
  const isHtml = (headers.get("content-type") ?? "").includes("text/html");
  // Asked for identity, so a body still encoded came from a server that ignores it, and is passed on as it is.
  const isEncoded = !["", "identity"].includes(headers.get("content-encoding") ?? "");
  if (!isHtml || isEncoded || isHead || !response.body) return new Response(response.body, init);
  const text = await response.text();
  // The checkbox only trusts its page by the origin Google wrote back, so it is given the one the frame really has.
  const page = captcha ? text.replaceAll(captcha.site, captcha.proxy) : text;
  const html = inject(page, { parents, place, target });
  // The site's validators describe its page, not this one, and a cached copy would make Reload skip a site that's down.
  for (const name of ["content-length", "etag", "last-modified"]) headers.delete(name);
  headers.set("cache-control", "no-store");
  return new Response(html, init);
}

function agentOf(target: URL): (typeof siteAgents)[keyof typeof siteAgents] {
  return target.protocol === "https:" || target.protocol === "wss:" ? siteAgents.https : siteAgents.http;
}

function isNavigation(request: Request): boolean {
  const dest = request.headers.get("sec-fetch-dest");
  return (
    dest === "document" || dest === "iframe" || (!dest && (request.headers.get("accept") ?? "").includes("text/html"))
  );
}

function noticePage({ held, status }: { held: Running; status: number }): Response {
  const parents = JSON.stringify([...held.parents]).replace(/</g, "\\u003c");
  const script = `for (const to of ${parents}) parent.postMessage({ channel: "${CHANNEL}", type: "down", url: location.href }, to);`;
  return new Response(`<!doctype html><meta charset="utf-8"><title>down</title><script>${script}</script>`, {
    headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" },
    status,
  });
}

async function pageFile(name: string): Promise<Response> {
  const source = await readFile(join(pluginRoot(), "lib", "web", "page", `${name}.ts`), "utf8").catch(() => undefined);
  if (!source) return new Response("", { status: 404 });
  return new Response(stripTypeScriptTypes(source), {
    headers: { "cache-control": "no-store", "content-type": "text/javascript; charset=utf-8" },
  });
}

function siteOf(url: URL): string {
  return `${url.protocol}//${getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname}`;
}

export interface TabInput {
  /** The page the request came from, as the site itself would see it, when the request names one of this artifact. */
  from?: URL;
  target: URL;
}

// The frame stands in for a browser tab, and a site may refuse what reads as framed, as Google's sign-in answers 401.
export function asTab(headers: Headers, { from, target }: TabInput): void {
  if (headers.get("sec-fetch-dest") === "iframe") headers.set("sec-fetch-dest", "document");
  const site = headers.get("sec-fetch-site");
  if (headers.get("sec-fetch-mode") === "navigate" && !from) headers.set("sec-fetch-site", "none");
  else if (from && site && site !== "none") {
    const relation =
      from.origin === target.origin ? "same-origin" : siteOf(from) === siteOf(target) ? "same-site" : "cross-site";
    headers.set("sec-fetch-site", relation);
  }
}

// Every proxy host is same-site to the browser, so the request's own Origin or Referer says which site it came from.
function initiatorOf(headers: Headers, held: Pick<Running, "slug">): { origin?: URL; referer?: URL } {
  const origin = headers.get("origin");
  const referer = headers.get("referer");
  return {
    origin: origin ? upstreamOf(origin, held)?.url : undefined,
    referer: referer ? upstreamOf(referer, held)?.url : undefined,
  };
}

interface AllowInput {
  from?: URL;
  method: string;
  mode?: string;
  site?: string;
  to: Reach;
}

// Private Network Access as Chrome draws it: a page reaches no host closer to this machine than its own, bar a plain navigation.
export async function isAllowed({ from, method, mode, site, to }: AllowInput): Promise<boolean> {
  if (to === "public" || !site || site === "same-origin" || site === "none") return true;
  if (from && RANK[await reachOf(from.hostname)] >= RANK[to]) return true;
  return mode === "navigate" && (method === "GET" || method === "HEAD");
}

async function handle(event: H3Event, held: Running): Promise<void> {
  const url = getRequestURL(event);
  if (url.pathname.startsWith(OWN)) {
    const name = PAGE_FILE.exec(url.pathname)?.[1];
    return sendWebResponse(event, name ? await pageFile(name) : new Response("", { status: 404 }));
  }
  const found = upstreamOf(url, held);
  if (!found) return sendWebResponse(event, new Response("", { status: 404 }));
  const { base, url: target } = found;
  const place = { base, port: held.port };
  const request = toWebRequest(event);
  const headers = new Headers(request.headers);
  const { origin, referer } = initiatorOf(headers, held);
  const from = origin ?? referer;
  const reach = await reachOf(target.hostname);
  const allowed = await isAllowed({
    from,
    method: request.method,
    mode: headers.get("sec-fetch-mode") ?? undefined,
    site: headers.get("sec-fetch-site") ?? undefined,
    to: reach,
  });
  if (!allowed) return sendWebResponse(event, new Response("", { status: 403 }));
  headers.set("accept-encoding", "identity");
  asTab(headers, { from: referer ?? origin, target });
  if (origin) headers.set("origin", origin.origin);
  else if (headers.get("origin") !== "null") headers.delete("origin");
  if (referer) headers.set("referer", referer.href);
  else headers.delete("referer");
  const captcha = captchaFor(target, held);
  const sent = captcha?.url ?? target;
  let response: Response;
  try {
    response = await proxyFetch(
      target.origin,
      new URL(`${sent.pathname}${sent.search}`, target.origin),
      { body: request.body, duplex: "half", headers, method: request.method, redirect: "manual" } as RequestInit,
      {
        agent: agentOf(target),
        changeOrigin: true,
        ssl: reach === "loopback" ? { rejectUnauthorized: false } : undefined,
      },
    );
  } catch {
    const down = isNavigation(request) && noticePage({ held, status: 502 });
    return sendWebResponse(event, down || new Response("", { status: 502 }));
  }
  const isHead = request.method === "HEAD";
  return sendWebResponse(
    event,
    await rewriteResponse({ captcha, isHead, parents: held.parents, place, reach, response, target }),
  );
}

function track(held: Running, socket: Duplex): void {
  held.sockets.add(socket);
  socket.once("close", () => held.sockets.delete(socket));
}

async function upgrade(held: Running, req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  const found = !req.url?.startsWith(OWN) && upstreamOf(`ws://${req.headers.host}${req.url ?? "/"}`, held);
  if (!found) {
    socket.destroy();
    return;
  }
  const target = found.url;
  const origin = req.headers.origin;
  const from = origin ? upstreamOf(origin, held)?.url : undefined;
  const reach = await reachOf(target.hostname);
  if (origin && reach !== "public" && !(from && RANK[await reachOf(from.hostname)] >= RANK[reach])) {
    socket.destroy();
    return;
  }
  const site = `${target.protocol === "wss:" ? "https:" : "http:"}//${target.host}`;
  track(held, socket);
  proxyUpgrade(site, req, socket, head, {
    agent: agentOf(target),
    changeOrigin: true,
    headers: { origin: from?.origin ?? site },
    secure: reach !== "loopback",
  })
    .then((upstream) => track(held, upstream))
    .catch(() => socket.destroy());
}

function listen({ held, host, listener }: { held: Running; host: string; listener: RequestListener }): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(listener);
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => void upgrade(held, req, socket, head));
    server.once("error", reject);
    server.listen(held.port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

async function start(held: Running): Promise<void> {
  const app = createApp();
  app.use(eventHandler((event) => handle(event, held)));
  const listener = toNodeListener(app);
  const [own, ...rest] = await Promise.allSettled(HOSTS.map((host) => listen({ held, host, listener })));
  held.servers = [own, ...rest].flatMap((one) => (one?.status === "fulfilled" ? [one.value] : []));
  if (own?.status === "rejected") {
    await close(held);
    running.delete(held.port);
    throw own.reason;
  }
}

function close(held: Running): Promise<void> {
  for (const socket of held.sockets) socket.destroy();
  return Promise.all(
    held.servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  ).then(() => undefined);
}

/** Starts the proxy for one artifact on its port, or joins the one already there. */
export async function serve({ parent, port, slug }: ProxyTarget): Promise<void> {
  const held = running.get(port);
  if (held?.generation === GENERATION && held.slug === slug) {
    held.parents.add(parent);
    return held.ready;
  }
  if (held) {
    running.delete(port);
    await held.ready.catch(() => undefined);
    await close(held);
  }
  const next: Running = {
    generation: GENERATION,
    parents: new Set([parent]),
    port,
    ready: Promise.resolve(),
    servers: [],
    slug,
    sockets: new Set(),
  };
  next.ready = start(next);
  running.set(port, next);
  return next.ready;
}

export async function stop(port: number): Promise<void> {
  const held = running.get(port);
  if (!held) return;
  running.delete(port);
  await held.ready.catch(() => undefined);
  await close(held);
}

export async function stopAll(): Promise<void> {
  const all = [...running.values()];
  running.clear();
  await Promise.all(all.map((held) => held.ready.catch(() => undefined).then(() => close(held))));
}
