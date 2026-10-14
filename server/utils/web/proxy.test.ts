import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, request, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { runInNewContext } from "node:vm";
import { landing } from "../../../lib/web/records.ts";
import { isFencedOrigin, rewriteResponse, serve, stopAll } from "./proxy.ts";

const PARENT = "http://sidecar.localhost:4747";
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

test("a page comes back framable, its cookies host-only and its own scripts first", async () => {
  let seen: IncomingHttpHeaders = {};
  const upstream = createServer((req, res) => {
    seen = req.headers;
    if (req.url === "/go") {
      res.writeHead(301, { location: `http://127.0.0.1:${up}/next` }).end();
      return;
    }
    res.writeHead(200, {
      "content-security-policy": "frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "set-cookie": ["sid=1; Domain=127.0.0.1; Path=/; HttpOnly", "theme=dark; Path=/; Max-Age=86400"],
      "x-frame-options": "DENY",
    });
    res.end(
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'none'"><title>x</title></head><body><p>hi</p></body></html>`,
    );
  });
  const up = await listen(upstream);
  const port = await freePort();
  await serve({ parent: PARENT, port, upstream: `http://127.0.0.1:${up}` });
  const host = `docs.sidecar.localhost:${port}`;

  const page = await get(port, "/", { host, origin: `http://${host}` });
  assert.equal(page.status, 200);
  assert.equal(page.headers["x-frame-options"], undefined);
  assert.equal(page.headers["content-security-policy"], undefined);
  assert.equal(page.headers["cache-control"], "no-store");
  assert.deepEqual(page.headers["set-cookie"], [
    "sid=1; Path=/; HttpOnly; Max-Age=34560000",
    "theme=dark; Path=/; Max-Age=86400",
  ]);
  assert.match(page.body, /^<!doctype html><html><head><script src="\/__sidecar\/bootstrap\.ts\?upstream=/);
  assert.ok(page.body.includes(`agent.ts?parent=${encodeURIComponent(PARENT)}`));
  assert.ok(!page.body.includes("script-src 'none'"));
  assert.equal(seen.host, `127.0.0.1:${up}`);
  assert.equal(seen.origin, `http://127.0.0.1:${up}`);
  assert.equal(seen["accept-encoding"], "identity");

  const moved = await get(port, "/go", { host });
  assert.deepEqual(
    [moved.status, moved.headers.location, moved.headers["cache-control"]],
    [302, `http://${host}/next`, "no-store"],
  );
});

test("a socket upgrade reaches the site as its own origin, so a dev server's HMR connects", async () => {
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
  await serve({ parent: PARENT, port, upstream: `http://127.0.0.1:${up}` });

  const socket = new WebSocket(`ws://127.0.0.1:${port}/_hmr`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  socket.close();
  assert.equal(seen.host, `127.0.0.1:${up}`);
  assert.equal(seen.origin, `http://127.0.0.1:${up}`);
});

test("a site that isn't answering tells the sidecar, and only a page load gets the page", async () => {
  const port = await freePort();
  const closed = await freePort();
  await serve({ parent: PARENT, port, upstream: `http://127.0.0.1:${closed}` });

  const page = await get(port, "/", { "sec-fetch-dest": "iframe" });
  assert.equal(page.status, 502);
  assert.ok(page.body.includes(`type: "down"`));
  assert.ok(page.body.includes(JSON.stringify([PARENT])));

  const asset = await get(port, "/app.js", { "sec-fetch-dest": "script" });
  assert.equal(asset.status, 502);
  assert.equal(asset.body, "");
});

test("a page that sends the frame to another site tells the sidecar where with its cookies, and opening chases to the last stop", async () => {
  const last = await listen(createServer((_req, res) => res.writeHead(200).end("ok")));
  const elsewhere = `http://localhost:${last}/consent`;
  const upstream = createServer((req, res) => {
    if (req.url === "/") res.writeHead(302, { location: "/home" }).end();
    else res.writeHead(302, { location: elsewhere, "set-cookie": "sid=2; Path=/" }).end();
  });
  const up = await listen(upstream);
  const port = await freePort();
  const site = `http://127.0.0.1:${up}`;
  await serve({ parent: PARENT, port, upstream: site });

  const page = await get(port, "/away", { "sec-fetch-dest": "iframe" });
  assert.equal(page.status, 200);
  assert.ok(page.body.includes(`type: "moved"`) && page.body.includes(JSON.stringify(elsewhere)));
  assert.deepEqual(page.headers["set-cookie"], ["sid=2; Path=/; Max-Age=34560000"]);
  assert.equal((await get(port, "/away", { "sec-fetch-dest": "empty" })).headers.location, elsewhere);

  assert.equal((await landing(new URL(`${site}/`))).href, `${site}/`);
  assert.equal((await landing(new URL(`${site}/away`))).href, elsewhere);
});

test("a remote site is fenced off from local services and from the sidecar's API", async () => {
  const remote = await freePort();
  const local = await freePort();
  await serve({ parent: PARENT, port: remote, upstream: "http://site.invalid" });
  await serve({ parent: PARENT, port: local, upstream: "http://localhost:9" });

  assert.equal(isFencedOrigin(`http://site-invalid-80--abcdef.sidecar.localhost:${remote}`), true);
  assert.equal(isFencedOrigin(`http://localhost-9--abcdef.sidecar.localhost:${local}`), false);
  assert.equal(isFencedOrigin(undefined), false);
  assert.equal(isFencedOrigin("null"), false);

  const fenced = await rewriteResponse({
    here: "http://x.sidecar.localhost:1",
    isHead: false,
    response: new Response("{}", { headers: { "content-type": "application/json" } }),
    running: { isLoopback: false, parents: new Set([PARENT]), upstream: "https://site.dev" },
  });
  assert.match(
    fenced.headers.get("content-security-policy") ?? "",
    /^connect-src 'self' https: wss:; form-action 'self' https:$/,
  );
});

test("the proxy serves its own scripts type-stripped and nothing else under its folder", async () => {
  const port = await freePort();
  await serve({ parent: PARENT, port, upstream: "http://localhost:9" });

  const agent = await get(port, "/__sidecar/agent.ts");
  assert.equal(agent.status, 200);
  assert.match(agent.headers["content-type"] ?? "", /^text\/javascript/);
  assert.ok(!agent.body.includes("type Indexed") && !agent.body.includes(": void"));
  for (const path of ["/__sidecar/nope.ts", "/__sidecar/agent.js", "/__sidecar/sub/agent.ts"])
    assert.equal((await get(port, path)).status, 404, path);
  // Normalised to /package.json, so it goes on to the site, which isn't up here, and never to the checkout.
  assert.equal((await get(port, "/__sidecar/../package.json")).status, 502);
});

test("the bootstrap points the site's own calls at the proxy, keeps its cookies and sessionStorage, and leaves the rest", async () => {
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
  const sandbox: Record<string, unknown> = {
    addEventListener: () => {},
    document: Object.assign(Object.create(Document.prototype) as object, {
      currentScript: {
        getAttribute: () => `/__sidecar/bootstrap.ts?upstream=${encodeURIComponent("http://localhost:3000")}`,
      },
    }),
    Document,
    EventSource: Socket,
    fetch: (input: unknown) => calls.push(`fetch ${input instanceof Request ? input.url : String(input)}`),
    localStorage: local,
    location: new URL("http://localhost-3000--abcdef.sidecar.localhost:47481/guide"),
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
  page.fetch("http://localhost:3000/api/x?y=1");
  page.fetch("//localhost:3000/b");
  page.fetch("/relative");
  page.fetch("https://other.dev/z");
  page.fetch(new Request("http://localhost:3000/req"));
  new page.WebSocket("ws://localhost:3000/_hmr");
  new page.XMLHttpRequest().open("GET", "http://localhost:3000/xhr");

  const proxy = "localhost-3000--abcdef.sidecar.localhost:47481";
  assert.deepEqual(calls, [
    `fetch http://${proxy}/api/x?y=1`,
    `fetch http://${proxy}/b`,
    "fetch /relative",
    "fetch https://other.dev/z",
    `fetch http://${proxy}/req`,
    `ws ws://${proxy}/_hmr`,
    `xhr 2 http://${proxy}/xhr`,
  ]);

  const doc = sandbox.document as { cookie: string };
  doc.cookie = "a=1; path=/";
  assert.equal(jar, "a=1; path=/; max-age=34560000");
  doc.cookie = "a=; Max-Age=0";
  assert.equal(jar, "a=; Max-Age=0");
  assert.equal(session.getItem("token"), "kept");
  session.setItem("token", "new");
  await Promise.resolve();
  assert.equal(local.getItem("__sidecar:session"), JSON.stringify({ token: "new" }));
});
