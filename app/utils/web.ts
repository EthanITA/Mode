import type { ReviewThread } from "../../shared/types/artifact.ts";

export interface WebOriginOptions {
  /** The sidecar's own address, whose host the proxy's is named under. */
  here: URL;
  port: number;
  slug: string;
}

export interface WebElsewhere {
  count: number;
  page: string;
}

const isIp = (host: string): boolean => host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host);

// A host per entry keeps each site's cookies apart, which a port alone does not; an IP has no subdomain to give.
function origin({ here, port, slug }: WebOriginOptions): string {
  return `http://${isIp(here.hostname) ? here.hostname : `${slug}.${here.hostname}`}:${port}`;
}

function pageOf(href: string): string {
  const at = new URL(href);
  return `${at.pathname}${at.search}`;
}

// The hash only scrolls, so a note made at #setup still belongs to the page without it.
function addressOf(href: string): string {
  const at = new URL(href);
  return `${at.origin}${at.pathname}${at.search}`;
}

function srcOf({ proxy, url }: { proxy: string; url: string }): string {
  const at = new URL(url);
  return `${proxy}${at.pathname}${at.search}${at.hash}`;
}

function upstreamOf(href: string, { proxy, upstream }: { proxy: string; upstream: string }): string {
  const at = new URL(href);
  return at.origin === proxy ? `${upstream}${at.pathname}${at.search}${at.hash}` : href;
}

function isLocal(href: string): boolean {
  const host = new URL(href).hostname;
  return host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.") || host === "[::1]";
}

const pageOfThread = (thread: ReviewThread): string => thread.anchor?.page ?? "/";

function threadsOn(threads: ReviewThread[], page: string): ReviewThread[] {
  return threads.filter((thread) => pageOfThread(thread) === page);
}

// The page with the newest open thread leads, since that is the one being worked on.
function elsewhere(threads: ReviewThread[], page: string): WebElsewhere[] {
  const groups = new Map<string, { count: number; latest: string }>();
  for (const thread of threads) {
    const on = pageOfThread(thread);
    if (on === page || thread.status === "resolved") continue;
    const held = groups.get(on) ?? { count: 0, latest: "" };
    const at = thread.updated ?? thread.at;
    groups.set(on, { count: held.count + 1, latest: at > held.latest ? at : held.latest });
  }
  return [...groups]
    .sort(([, a], [, b]) => b.latest.localeCompare(a.latest))
    .map(([on, { count }]) => ({ count, page: on }));
}

export const Web = { addressOf, elsewhere, isLocal, origin, pageOf, srcOf, threadsOn, upstreamOf };
