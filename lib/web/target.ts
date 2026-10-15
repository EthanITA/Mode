const LOOPBACK_NAME = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$|\.localhost$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const SEARCH = "https://www.google.com/search?q=";

/** A URL as typed, scheme optional: a name on this machine defaults to http and anything else to https. */
export function parseTarget(raw: string): URL | undefined {
  const typed = raw.trim();
  if (!typed || /\s/.test(typed)) return undefined;
  const hasScheme = SCHEME.test(typed);
  const authority = typed.replace(SCHEME, "").split(/[/?#]/)[0] ?? "";
  const host = authority.startsWith("[") ? authority.replace(/\]:\d+$/, "]") : authority.replace(/:\d+$/, "");
  // A browser reads a lone word as a search, unless it names this machine or carries a port.
  if (!hasScheme && !host.includes(".") && !LOOPBACK_NAME.test(host) && host === authority) return undefined;
  const given = hasScheme ? typed : `${LOOPBACK_NAME.test(host) ? "http" : "https"}://${typed}`;
  try {
    const url = new URL(given);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** Where typing it in an address bar goes: the address it names, or a search for it. */
export function addressOf(raw: string): URL | undefined {
  const typed = raw.trim();
  return typed ? (parseTarget(typed) ?? new URL(`${SEARCH}${encodeURIComponent(typed)}`)) : undefined;
}
