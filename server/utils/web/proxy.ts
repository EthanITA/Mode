import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type RequestListener, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
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
import { pluginRoot } from "../../../lib/mode/paths.ts";
import { CHANNEL } from "../../../lib/web/page/protocol.ts";
import { siteAgents } from "../../../lib/web/records.ts";

export interface ProxyTarget {
  /** The origin the sidecar's page is on, which is the only one the injected agent answers. */
  parent: string;
  port: number;
  /** The site's own origin, which every request goes on to. */
  upstream: string;
}

interface Running {
  generation: symbol;
  isLoopback: boolean;
  parents: Set<string>;
  ready: Promise<void>;
  servers: Server[];
  // An upgraded socket leaves the server's books, so close would wait on an open HMR socket forever.
  sockets: Set<Duplex>;
  upstream: string;
}

const GENERATION = Symbol("web-proxy");
// IPv4 must bind, since Chrome's *.localhost lookup tries it; a machine without IPv6 just serves one.
const HOSTS = ["127.0.0.1", "::1"];
const OWN = "/__sidecar/";
const PAGE_FILE = /^\/__sidecar\/([a-z]+)\.ts$/;
const DROPPED = ["content-security-policy", "content-security-policy-report-only", "x-frame-options"];
const PERMANENT: Record<number, number> = { 301: 302, 308: 307 };
const META_CSP = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;
// A remote page runs on a loopback origin here, so its calls stay on the proxy and the open web, away from local services.
const FENCE = "connect-src 'self' https: wss:; form-action 'self' https:";

// Process-wide, so a dev reload that re-imports this module still finds the proxies the last copy opened.
const scope = globalThis as typeof globalThis & { sidecarWebProxies?: Map<number, Running> };
const running = (scope.sidecarWebProxies ??= new Map<number, Running>());

export async function isLoopbackHost(host: string): Promise<boolean> {
  const name = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  try {
    const found = await lookup(name, { all: true });
    return found.length > 0 && found.every(({ address }) => address === "::1" || address.startsWith("127."));
  } catch {
    return false;
  }
}

/** True for a page served by a proxy to a remote site, which must never reach the sidecar's own API. */
export function isFencedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const held = running.get(Number(new URL(origin).port));
    return !!held && !held.isLoopback;
  } catch {
    return false;
  }
}

function swapOrigin(value: string, from: string, to: string): string {
  return value === from || value.startsWith(`${from}/`) ? `${to}${value.slice(from.length)}` : value;
}

// A session cookie dies with the browser, so a site's login would too; 400 days is the longest Chrome keeps one.
const LASTING = "; Max-Age=34560000";

function kept(cookie: string): string {
  const own = cookie.replace(/;\s*domain=[^;]*/gi, "");
  return /;\s*(expires|max-age)\s*=/i.test(own) ? own : `${own}${LASTING}`;
}

function cookiesOf(response: Response): string[] {
  return response.headers.getSetCookie().map(kept);
}

function inject(html: string, { parents, upstream }: { parents: Set<string>; upstream: string }): string {
  const tags =
    `<script src="${OWN}bootstrap.ts?upstream=${encodeURIComponent(upstream)}"></script>` +
    `<script type="module" src="${OWN}agent.ts?parent=${encodeURIComponent([...parents].join(","))}"></script>`;
  const page = html.replace(META_CSP, "");
  const at = /<head\b[^>]*>/i.exec(page) ?? /<html\b[^>]*>/i.exec(page) ?? /<!doctype[^>]*>/i.exec(page);
  const end = at ? at.index + at[0].length : 0;
  return `${page.slice(0, end)}${tags}${page.slice(end)}`;
}

interface RewriteInput {
  here: string;
  isHead: boolean;
  response: Response;
  running: Pick<Running, "isLoopback" | "parents" | "upstream">;
}

export async function rewriteResponse({ here, isHead, response, running: held }: RewriteInput): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const name of DROPPED) headers.delete(name);
  const location = headers.get("location");
  if (location) headers.set("location", swapOrigin(location, held.upstream, here));
  headers.delete("set-cookie");
  for (const cookie of cookiesOf(response)) headers.append("set-cookie", cookie);
  if (!held.isLoopback) headers.set("content-security-policy", FENCE);
  // A browser keeps a permanent redirect forever, so one passed on once would send the frame past the proxy for good.
  const status = PERMANENT[response.status] ?? response.status;
  if (status !== response.status) headers.set("cache-control", "no-store");
  const init = { headers, status, statusText: status === response.status ? response.statusText : "" };
  const isHtml = (headers.get("content-type") ?? "").includes("text/html");
  // Asked for identity, so a body still encoded came from a server that ignores it, and is passed on as it is.
  const isEncoded = !["", "identity"].includes(headers.get("content-encoding") ?? "");
  if (!isHtml || isEncoded || isHead || !response.body) return new Response(response.body, init);
  const html = inject(await response.text(), held);
  // The site's validators describe its page, not this one, and a cached copy would make Reload skip a site that's down.
  for (const name of ["content-length", "etag", "last-modified"]) headers.delete(name);
  headers.set("cache-control", "no-store");
  return new Response(html, init);
}

function agentOf(held: Running): (typeof siteAgents)[keyof typeof siteAgents] {
  return held.upstream.startsWith("https:") ? siteAgents.https : siteAgents.http;
}

function isNavigation(request: Request): boolean {
  const dest = request.headers.get("sec-fetch-dest");
  return (
    dest === "document" || dest === "iframe" || (!dest && (request.headers.get("accept") ?? "").includes("text/html"))
  );
}

// A frame that followed it would leave the proxy for a site that refuses to be framed, so the sidecar is told instead.
function movedTo(response: Response, upstream: string): string | undefined {
  const location = response.headers.get("location");
  if (response.status < 300 || response.status >= 400 || !location) return undefined;
  const next = new URL(location, upstream);
  return next.origin === upstream || !/^https?:$/.test(next.protocol) ? undefined : next.href;
}

interface NoticeInput {
  cookies?: string[];
  held: Running;
  status: number;
  type: "down" | "moved";
  url?: string;
}

function noticePage({ cookies = [], held, status, type, url }: NoticeInput): Response {
  const parents = JSON.stringify([...held.parents]).replace(/</g, "\\u003c");
  const to = JSON.stringify(url ?? "").replace(/</g, "\\u003c");
  const script = `for (const to of ${parents}) parent.postMessage({ channel: "${CHANNEL}", type: "${type}", url: ${to} || location.href }, to);`;
  const headers = new Headers({ "cache-control": "no-store", "content-type": "text/html; charset=utf-8" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(`<!doctype html><meta charset="utf-8"><title>${type}</title><script>${script}</script>`, {
    headers,
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

async function handle(event: H3Event, held: Running): Promise<void> {
  const url = getRequestURL(event);
  if (url.pathname.startsWith(OWN)) {
    const name = PAGE_FILE.exec(url.pathname)?.[1];
    return sendWebResponse(event, name ? await pageFile(name) : new Response("", { status: 404 }));
  }
  const request = toWebRequest(event);
  const headers = new Headers(request.headers);
  headers.set("accept-encoding", "identity");
  for (const name of ["origin", "referer"]) {
    const value = headers.get(name);
    if (value) headers.set(name, swapOrigin(value, url.origin, held.upstream));
  }
  let response: Response;
  try {
    response = await proxyFetch(
      held.upstream,
      new URL(`${url.pathname}${url.search}`, held.upstream),
      { body: request.body, duplex: "half", headers, method: request.method, redirect: "manual" } as RequestInit,
      {
        agent: agentOf(held),
        changeOrigin: true,
        ssl: held.isLoopback ? { rejectUnauthorized: false } : undefined,
      },
    );
  } catch {
    const down = isNavigation(request) && noticePage({ held, status: 502, type: "down" });
    return sendWebResponse(event, down || new Response("", { status: 502 }));
  }
  const moved = isNavigation(request) && movedTo(response, held.upstream);
  // A sign-in often sets its session on the very redirect that leaves, so the cookies ride on the notice.
  const cookies = moved ? cookiesOf(response) : [];
  if (moved) return sendWebResponse(event, noticePage({ cookies, held, status: 200, type: "moved", url: moved }));
  const isHead = request.method === "HEAD";
  return sendWebResponse(event, await rewriteResponse({ here: url.origin, isHead, response, running: held }));
}

function track(held: Running, socket: Duplex): void {
  held.sockets.add(socket);
  socket.once("close", () => held.sockets.delete(socket));
}

function upgrade(held: Running, req: IncomingMessage, socket: Duplex, head: Buffer): void {
  if (req.url?.startsWith(OWN)) {
    socket.destroy();
    return;
  }
  track(held, socket);
  proxyUpgrade(held.upstream, req, socket, head, {
    agent: agentOf(held),
    changeOrigin: true,
    headers: { origin: held.upstream },
    secure: !held.isLoopback,
  })
    .then((upstream) => track(held, upstream))
    .catch(() => socket.destroy());
}

function listen({
  held,
  host,
  listener,
  port,
}: {
  held: Running;
  host: string;
  listener: RequestListener;
  port: number;
}): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(listener);
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => upgrade(held, req, socket, head));
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

async function start(held: Running, port: number): Promise<void> {
  held.isLoopback = await isLoopbackHost(new URL(held.upstream).hostname);
  const app = createApp();
  app.use(eventHandler((event) => handle(event, held)));
  const listener = toNodeListener(app);
  const [own, ...rest] = await Promise.allSettled(HOSTS.map((host) => listen({ held, host, listener, port })));
  held.servers = [own, ...rest].flatMap((one) => (one?.status === "fulfilled" ? [one.value] : []));
  if (own?.status === "rejected") {
    await close(held);
    running.delete(port);
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

/** Starts the proxy for one site on its port, or joins the one already there. */
export async function serve({ parent, port, upstream }: ProxyTarget): Promise<void> {
  const held = running.get(port);
  if (held?.generation === GENERATION && held.upstream === upstream) {
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
    isLoopback: false,
    parents: new Set([parent]),
    ready: Promise.resolve(),
    servers: [],
    sockets: new Set(),
    upstream,
  };
  next.ready = start(next, port);
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
