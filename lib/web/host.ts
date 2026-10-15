export interface ProxyPlace {
  /** The artifact's own name under the sidecar's host, which every site it visits is served beneath. */
  base: string;
  port: number;
}

const LABEL = /^(https?)(?:-(\d+))?$/;
const SOCKET: Record<string, string> = { "ws:": "http:", "wss:": "https:" };

// The site's host, scheme and port fold into one name under the artifact's, so each site keeps an origin and cookies of its own.
function proxied(raw: string | URL, { base, port }: ProxyPlace): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const scheme = SOCKET[url.protocol] ?? url.protocol;
  if (scheme !== "http:" && scheme !== "https:") return undefined;
  // A bracketed IPv6 address can't be a label, and the loopback one answers as localhost too.
  const host = url.hostname === "[::1]" ? "localhost" : url.hostname;
  if (host.startsWith("[") || host.endsWith(`.${base}`)) return undefined;
  const label = `${scheme.slice(0, -1)}${url.port ? `-${url.port}` : ""}`;
  const to = url.protocol in SOCKET ? "ws" : "http";
  return `${to}://${host}.${label}.${base}:${port}${url.pathname}${url.search}${url.hash}`;
}

function upstream(raw: string | URL, base: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (!url.hostname.endsWith(`.${base}`)) return undefined;
  const head = url.hostname.slice(0, -base.length - 1);
  const cut = head.lastIndexOf(".");
  const [, scheme, port] = LABEL.exec(head.slice(cut + 1)) ?? [];
  if (cut < 1 || !scheme) return undefined;
  const to = url.protocol === "ws:" ? (scheme === "https" ? "wss" : "ws") : scheme;
  return new URL(`${to}://${head.slice(0, cut)}${port ? `:${port}` : ""}${url.pathname}${url.search}${url.hash}`);
}

/** The artifact's base: its slug under the sidecar's own host, which must end in localhost for the frame to resolve. */
function baseOf({ host, slug }: { host: string; slug: string }): string {
  return `${slug}.${host === "localhost" || host.endsWith(".localhost") ? host : "sidecar.localhost"}`;
}

/** The base a proxy host was named under, read by finding the artifact's slug in it. */
function baseIn({ host, slug }: { host: string; slug: string }): string | undefined {
  const at = host.lastIndexOf(`.${slug}.`);
  return at < 0 ? undefined : host.slice(at + 1);
}

export const WebHost = { baseIn, baseOf, proxied, upstream };
