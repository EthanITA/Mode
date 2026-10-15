export interface ProxyPlace {
  /** The same for every artifact, so a sign-in or a solved captcha in one holds in all of them. */
  base: string;
  port: number;
}

const LABEL = /^(https?)(?:-(\d+))?$/;
const SOCKET: Record<string, string> = { "ws:": "http:", "wss:": "https:" };

// The site's host, scheme and port fold into one name under the base, so each site keeps an origin and cookies of its own.
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

const isLocal = (host: string): boolean => host === "localhost" || host.endsWith(".localhost");

// Under the sidecar's own host the frame is same-site with it, so the site's SameSite cookies still reach it.
function baseOf(host: string): string {
  return isLocal(host) ? host : "sidecar.localhost";
}

// The base never holds a scheme label, so the last one names where the site's host ends.
function baseIn(host: string): string | undefined {
  const labels = host.split(".");
  for (let at = labels.length - 2; at > 0; at -= 1) {
    if (!LABEL.test(labels[at] ?? "")) continue;
    const base = labels.slice(at + 1).join(".");
    return isLocal(base) ? base : undefined;
  }
  return undefined;
}

export const WebHost = { baseIn, baseOf, proxied, upstream };
