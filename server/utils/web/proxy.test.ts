import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, request, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { runInNewContext } from "node:vm";
import { WebHost } from "../../../lib/web/host.ts";
import { asTab, isAllowed, isFencedOrigin, keptCookie, rewriteResponse, serve, stopAll } from "./proxy.ts";

const PARENT = "http://sidecar.localhost:4747";
const SLUG = "app-abc123";
const BASE = `${SLUG}.sidecar.localhost`;
const servers: Server[] = [];

after(async () => {
  await stopAll();
  for (const server of servers) server.close();
});

function listen(server: Server): Promise<number> {
  servers.push(server);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

async function freePort(): Promise<number> {
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

interface Got {
  body: string;
  headers: IncomingHttpHeaders;
  status: number;
}

function get(port: number, path: string, headers: Record<string, string> = {}): Promise<Got> {
  return new Promise((resolve, reject) => {
    const req = request({ headers, host: "127.0.0.1", path, port }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve({ body, headers: res.headers, status: res.statusCode ?? 0 }));
    });
    req.on("error", reject);
    req.end();
  });
}

// The proxy host the browser would use for a site inside this test's artifact.
const hostOf = (site: string, port: number): string => new URL(WebHost.proxied(site, { base: BASE, port }) ?? "").host;

test("a page comes back framable, the page's nonce on the proxy's scripts and its absolute scripts and redirects kept inside", async () => {
  let seen: IncomingHttpHeaders = {};
  const upstream = createServer((req, res) => {
    seen = req.headers;
    if (req.url === "/go") {
      res.writeHead(301, { location: "https://accounts.example.dev/next" }).end();
      return;
    }
    res.writeHead(200, {
      "content-security-policy": "frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "set-cookie": "theme=dark; Path=/; Max-Age=86400",
      "x-frame-options": "DENY",
    });
    res.end(
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'none'"><script nonce="n0nce" src="https://cdn.example.dev/app.js?a=1&amp;b=2"></script></head><body><img src="https://cdn.example.dev/i.png"></body></html>`,
    );
  });
  const up = await listen(upstream);
  const port = await freePort();
  await serve({ parent: PARENT, port, slug: SLUG });
  const host = hostOf(`http://localhost:${up}`, port);

  const page = await get(port, "/", { host, origin: `http://${host}` });
  assert.equal(page.status, 200);
  assert.equal(page.headers["x-frame-options"], undefined);
  assert.equal(page.headers["content-security-policy"], undefined);
  assert.deepEqual(page.headers["set-cookie"], ["theme=dark; Path=/; Max-Age=86400"]);
  assert.ok(
    page.body.startsWith(
      `<!doctype html><html><head><script nonce="n0nce" src="/__sidecar/bootstrap.ts?base=${encodeURIComponent(BASE)}">`,
    ),
  );
  assert.ok(
    page.body.includes(
      `<script nonce="n0nce" type="module" src="/__sidecar/agent.ts?parent=${encodeURIComponent(PARENT)}">`,
    ),
  );
  assert.ok(page.body.includes(`src="http://${hostOf("https://cdn.example.dev", port)}/app.js?a=1&amp;b=2"`));
  assert.ok(page.body.includes(`<img src="https://cdn.example.dev/i.png">`));
  assert.ok(!page.body.includes("script-src 'none'"));
  assert.deepEqual(
    [seen.host, seen.origin, seen["accept-encoding"]],
    [`localhost:${up}`, `http://localhost:${up}`, "identity"],
  );

  const moved = await get(port, "/go", { host });
  assert.deepEqual(
    [moved.status, moved.headers.location, moved.headers["cache-control"]],
    [302, `http://${hostOf("https://accounts.example.dev", port)}/next`, "no-store"],
  );
  assert.equal((await get(port, "/", { host: `127.0.0.1:${port}` })).status, 404);
});

test("a site's cookie domain and its CORS answer name the artifact's hosts, so its other hosts share them here", async () => {
  const place = { base: BASE, port: 47488 };
  const target = new URL("https://www.reddit.com/r/vue");
  assert.equal(
    keptCookie("sid=1; Domain=.reddit.com; Path=/; Secure", { place, target }),
    `sid=1; Path=/; Secure; Max-Age=34560000; Domain=reddit.com.https.${BASE}`,
  );
  for (const foreign of ["a=1; Domain=evil.com", "a=1; Domain=com"])
    assert.equal(keptCookie(foreign, { place, target }), "a=1; Max-Age=34560000");

  const answered = await rewriteResponse({
    isHead: false,
    parents: new Set([PARENT]),
    place,
    reach: "public",
    response: new Response("{}", {
      headers: { "access-control-allow-origin": "https://www.reddit.com", "content-type": "application/json" },
    }),
    target: new URL("https://www.redditstatic.com/x.js"),
  });
  assert.equal(answered.headers.get("access-control-allow-origin"), `http://www.reddit.com.https.${BASE}:47488`);
  assert.equal(
    answered.headers.get("content-security-policy"),
    `connect-src 'self' https: wss: http://*.${BASE}:47488 ws://*.${BASE}:47488; form-action 'self' https: http://*.${BASE}:47488`,
  );
});

function upgrade(port: number, headers: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request({
      headers: {
        connection: "Upgrade",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
        upgrade: "websocket",
        ...headers,
      },
      host: "127.0.0.1",
      port,
    });
    req.on("upgrade", (_res, socket) => {
      socket.destroy();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("response", () => resolve(false));
    req.end();
  });
}

test("a socket reaches the site as the page's own origin, and one from a site off this machine never reaches a local one", async () => {
  let seen: IncomingHttpHeaders = {};
  const upstream = createServer();
  upstream.on("upgrade", (req, socket) => {
    seen = req.headers;
    const accept = createHash("sha1")
      .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  });
  const up = await listen(upstream);
  const port = await freePort();
  await serve({ parent: PARENT, port, slug: SLUG });
  const host = hostOf(`http://localhost:${up}`, port);

  assert.equal(await upgrade(port, { host, origin: `http://${host}` }), true);
  assert.deepEqual([seen.host, seen.origin], [`localhost:${up}`, `http://localhost:${up}`]);
  assert.equal(await upgrade(port, { host, origin: `http://${hostOf("https://site.invalid", port)}` }), false);
});

test("a site that isn't answering tells the sidecar, and only a page load gets the page", async () => {
  const port = await freePort();
  const closed = await freePort();
  await serve({ parent: PARENT, port, slug: SLUG });
  const host = hostOf(`http://localhost:${closed}`, port);

  const page = await get(port, "/", { host, "sec-fetch-dest": "iframe" });
  assert.equal(page.status, 502);
  assert.ok(page.body.includes(`type: "down"`) && page.body.includes(JSON.stringify([PARENT])));
  const asset = await get(port, "/app.js", { host, "sec-fetch-dest": "script" });
  assert.deepEqual([asset.status, asset.body], [502, ""]);
});

test("a page reaches no host closer to this machine than its own, bar a plain navigation, and the sidecar's API only from this machine", async () => {
  const upstream = createServer((_req, res) => res.writeHead(200, { "content-type": "text/plain" }).end("local"));
  const up = await listen(upstream);
  const port = await freePort();
  await serve({ parent: PARENT, port, slug: SLUG });
  const local = hostOf(`http://localhost:${up}`, port);
  const remote = `http://${hostOf("https://site.invalid", port)}`;

  const call = { "sec-fetch-mode": "cors", "sec-fetch-site": "same-site" };
  assert.equal((await get(port, "/api", { ...call, host: local, origin: remote })).status, 403);
  assert.equal((await get(port, "/api", { ...call, host: local, referer: `${remote}/x` })).status, 403);
  assert.equal((await get(port, "/api", { ...call, host: local })).status, 403);
  const nav = { "sec-fetch-dest": "iframe", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-site" };
  assert.equal((await get(port, "/", { ...nav, host: local, referer: `${remote}/x` })).status, 200);
  assert.equal((await get(port, "/api", { ...call, host: local, origin: `http://${local}` })).status, 200);
  assert.equal((await get(port, "/api", { host: local, "sec-fetch-site": "same-origin" })).status, 200);

  const site = new URL("https://site.invalid/");
  assert.equal(
    await isAllowed({ from: site, method: "POST", mode: "navigate", site: "same-site", to: "loopback" }),
    false,
  );
  assert.equal(await isAllowed({ from: site, method: "GET", mode: "cors", site: "same-site", to: "public" }), true);
  assert.equal(await isAllowed({ from: site, method: "GET", mode: "cors", site: "same-site", to: "private" }), false);

  assert.equal(isFencedOrigin(`http://${local}`), false);
  assert.equal(isFencedOrigin(remote), true);
  assert.equal(isFencedOrigin(undefined), false);
  assert.equal(isFencedOrigin("null"), false);
});

test("the proxy serves its own scripts type-stripped and nothing else under its folder", async () => {
  const port = await freePort();
  await serve({ parent: PARENT, port, slug: SLUG });

  const agent = await get(port, "/__sidecar/agent.ts");
  assert.equal(agent.status, 200);
  assert.match(agent.headers["content-type"] ?? "", /^text\/javascript/);
  assert.ok(!agent.body.includes("type Indexed") && !agent.body.includes(": void"));
  for (const path of ["/__sidecar/nope.ts", "/__sidecar/agent.js", "/__sidecar/sub/agent.ts"])
    assert.equal((await get(port, path)).status, 404, path);
  // Normalised to /package.json, which names no site of the artifact, and never the checkout.
  assert.equal((await get(port, "/__sidecar/../package.json")).status, 404);
});

test("a request leaves as a browser tab's would: never framed, and each site's relation to the page as the site sees it", () => {
  const sent = (
    init: Record<string, string>,
    from?: string,
    to = "https://www.reddit.com/r/vue",
  ): Record<string, string> => {
    const headers = new Headers(init);
    asTab(headers, { from: from ? new URL(from) : undefined, target: new URL(to) });
    return Object.fromEntries(headers);
  };
  assert.deepEqual(sent({ "sec-fetch-dest": "iframe", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-site" }), {
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
  });
  const call = { "sec-fetch-site": "same-site" };
  assert.equal(sent(call, "https://www.reddit.com/")["sec-fetch-site"], "same-origin");
  assert.equal(
    sent(call, "https://www.reddit.com/", "https://www.redditstatic.com/x.js")["sec-fetch-site"],
    "cross-site",
  );
  assert.equal(sent(call, "https://www.google.com/", "https://accounts.google.com/")["sec-fetch-site"], "same-site");
});

test("the bootstrap keeps every call, socket, script, form and navigation inside the artifact, with its cookies and sessionStorage", async () => {
  const calls: string[] = [];
  class Xhr {
    open(...args: unknown[]): void {
      calls.push(`xhr ${args.length} ${String(args[1])}`);
    }
  }
  class Socket {
    constructor(url: string) {
      calls.push(`ws ${url}`);
    }
  }
  class Form {
    #attrs = new Map<string, string>();
    getAttribute(name: string): string | undefined {
      return this.#attrs.get(name);
    }
    setAttribute(name: string, value: string): void {
      this.#attrs.set(name, value);
    }
    submit(): void {
      calls.push(`submit ${this.getAttribute("action")} ${this.getAttribute("target")}`);
    }
  }
  let jar = "";
  class Document {
    get cookie(): string {
      return jar;
    }
    set cookie(value: string) {
      jar = value;
    }
  }
  class Storage {
    #held = new Map<string, string>();
    get length(): number {
      return this.#held.size;
    }
    key(at: number): string | undefined {
      return [...this.#held.keys()][at];
    }
    getItem(name: string): string | undefined {
      return this.#held.get(name);
    }
    setItem(name: string, value: string): void {
      this.#held.set(name, value);
    }
    removeItem(name: string): void {
      this.#held.delete(name);
    }
    clear(): void {
      this.#held.clear();
    }
  }
  const local = new Storage();
  const session = new Storage();
  local.setItem("__sidecar:session", JSON.stringify({ token: "kept" }));
  const listeners: Record<string, (event: unknown) => void> = {};
  let navigate: ((event: unknown) => void) | undefined;
  const port = 47481;
  const place = { base: BASE, port };
  const here = WebHost.proxied("https://www.example.dev/guide", place) ?? "";
  const sandbox: Record<string, unknown> = {
    addEventListener: (type: string, listener: (event: unknown) => void) => (listeners[type] = listener),
    document: Object.assign(Object.create(Document.prototype) as object, {
      currentScript: { getAttribute: () => `/__sidecar/bootstrap.ts?base=${encodeURIComponent(BASE)}` },
    }),
    Document,
    EventSource: Socket,
    fetch: (input: unknown) => calls.push(`fetch ${input instanceof Request ? input.url : String(input)}`),
    HTMLFormElement: Form,
    localStorage: local,
    location: Object.assign(new URL(here), {
      assign: (to: string) => calls.push(`assign ${to}`),
      replace: (to: string) => calls.push(`replace ${to}`),
    }),
    navigation: { addEventListener: (_type: string, listener: (event: unknown) => void) => (navigate = listener) },
    queueMicrotask,
    Request,
    sessionStorage: session,
    Storage,
    URL,
    WebSocket: Socket,
    XMLHttpRequest: Xhr,
  };
  sandbox.window = sandbox;
  const source = stripTypeScriptTypes(
    readFileSync(new URL("../../../lib/web/page/bootstrap.ts", import.meta.url), "utf8"),
  );
  runInNewContext(source, sandbox);

  const page = sandbox as {
    fetch: (input: unknown) => void;
    WebSocket: new (url: string) => unknown;
    XMLHttpRequest: new () => Xhr;
  };
  const proxy = (site: string): string => WebHost.proxied(site, place) ?? "";
  page.fetch("https://www.example.dev/api/x?y=1");
  page.fetch("//cdn.example.dev/b");
  page.fetch("/relative");
  page.fetch("http://localhost:3000/z");
  page.fetch(new Request("https://gql.example.dev/req"));
  page.fetch(here);
  new page.WebSocket("wss://live.example.dev/feed");
  new page.XMLHttpRequest().open("GET", "https://www.example.dev/xhr");
  assert.deepEqual(calls.splice(0), [
    `fetch ${proxy("https://www.example.dev/api/x?y=1")}`,
    `fetch ${proxy("https://cdn.example.dev/b")}`,
    "fetch /relative",
    `fetch ${proxy("http://localhost:3000/z")}`,
    `fetch ${proxy("https://gql.example.dev/req")}`,
    `fetch ${here}`,
    `ws ${proxy("wss://live.example.dev/feed")}`,
    `xhr 2 ${proxy("https://www.example.dev/xhr")}`,
  ]);

  const link = { href: "https://accounts.example.dev/login" };
  listeners.click?.({ target: { closest: () => link }, type: "click" });
  assert.equal(link.href, proxy("https://accounts.example.dev/login"));
  const scripted = new Form();
  scripted.setAttribute("action", "https://consent.example.dev/save");
  scripted.setAttribute("target", "_top");
  scripted.submit();
  assert.equal(calls.pop(), `submit ${proxy("https://consent.example.dev/save")} _self`);
  const button = new Form();
  button.setAttribute("formaction", "https://www.example.dev/go");
  listeners.submit?.({ submitter: button, target: new Form(), type: "submit" });
  assert.equal(button.getAttribute("formaction"), proxy("https://www.example.dev/go"));

  let stopped = 0;
  const go = (url: string, navigationType = "push"): void =>
    navigate?.({ cancelable: true, destination: { url }, navigationType, preventDefault: () => (stopped += 1) });
  go("https://elsewhere.dev/a");
  go(proxy("https://elsewhere.dev/b"));
  go("https://elsewhere.dev/c", "replace");
  assert.deepEqual(
    [stopped, calls.splice(0)],
    [2, [`assign ${proxy("https://elsewhere.dev/a")}`, `replace ${proxy("https://elsewhere.dev/c")}`]],
  );

  const doc = sandbox.document as { cookie: string };
  doc.cookie = "sid=1; domain=.example.dev; path=/";
  assert.equal(jar, `sid=1; path=/; max-age=34560000; domain=example.dev.https.${BASE}`);
  doc.cookie = "a=1; domain=evil.dev";
  assert.equal(jar, "a=1; max-age=34560000");
  doc.cookie = "a=; Max-Age=0";
  assert.equal(jar, "a=; Max-Age=0");
  assert.equal(session.getItem("token"), "kept");
  session.setItem("token", "new");
  await Promise.resolve();
  assert.equal(local.getItem("__sidecar:session"), JSON.stringify({ token: "new" }));
});
