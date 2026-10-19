import { type ProxyPlace, WebHost } from "../../lib/web/host.ts";
import { parseTarget } from "../../lib/web/target.ts";
import type { ReviewThread } from "../../shared/types/artifact.ts";

export interface WebPlaceOptions {
  /** The sidecar's own address, whose host every artifact's sites are named under. */
  here: URL;
  port: number;
}

export interface WebElsewhere {
  count: number;
  page: string;
}

export interface RelayHost extends EventTarget {
  documentElement: { dataset: DOMStringMap };
}

// The extension marks the sidecar before its scripts run, then says ready once the tab's frame rules hold, or unmarks it.
function relay(host: RelayHost = document): Promise<string | undefined> {
  const { dataset } = host.documentElement;
  const ready = (): string | undefined => (dataset.sidecarRelayReady ? dataset.sidecarRelay : undefined);
  if (!dataset.sidecarRelay || dataset.sidecarRelayReady) return Promise.resolve(ready());
  return new Promise((resolve) => host.addEventListener("sidecar-relay", () => resolve(ready()), { once: true }));
}

const relayed = (relay: string, to: string): string => `${relay}?${new URLSearchParams({ to })}`;

function placeOf({ here, port }: WebPlaceOptions): ProxyPlace {
  return { base: WebHost.baseOf(here.hostname), port };
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

// The address as one would type it: the scheme goes only when typing it back would bring the same one.
function typed(href: string): string {
  const at = new URL(href);
  const bare = href.slice(at.protocol.length + 2).replace(/^([^/?#]*)\/$/, "$1");
  return parseTarget(bare)?.href === at.href ? bare : href;
}

// Shorter when it is on the site already showing, the way a tab names a page of its own site.
function shortOf(address: string, { from }: { from?: string }): string {
  const at = new URL(address);
  return from && new URL(from).origin === at.origin ? pageOf(address) : `${at.host}${pageOf(address)}`;
}

function isLocal(href: string): boolean {
  const host = new URL(href).hostname;
  return host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.") || host === "[::1]";
}

const pageOfThread = (thread: ReviewThread): string => thread.anchor?.page ?? "";

function threadsOn(threads: ReviewThread[], page: string): ReviewThread[] {
  return threads.filter((thread) => pageOfThread(thread) === page);
}

// The page with the newest open thread leads, since that is the one being worked on.
function elsewhere(threads: ReviewThread[], page: string): WebElsewhere[] {
  const groups = new Map<string, { count: number; latest: string }>();
  for (const thread of threads) {
    const on = pageOfThread(thread);
    if (!on || on === page || thread.status === "resolved") continue;
    const held = groups.get(on) ?? { count: 0, latest: "" };
    const at = thread.updated ?? thread.at;
    groups.set(on, { count: held.count + 1, latest: at > held.latest ? at : held.latest });
  }
  return [...groups]
    .sort(([, a], [, b]) => b.latest.localeCompare(a.latest))
    .map(([on, { count }]) => ({ count, page: on }));
}

export const Web = {
  addressOf,
  elsewhere,
  isLocal,
  pageOf,
  placeOf,
  proxied: WebHost.proxied,
  relay,
  relayed,
  shortOf,
  threadsOn,
  typed,
  upstream: WebHost.upstream,
};
