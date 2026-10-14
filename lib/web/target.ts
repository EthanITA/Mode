const LOOPBACK_NAME = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$|\.localhost$/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** A URL as typed, scheme optional: a name on this machine defaults to http and anything else to https. */
export function parseTarget(raw: string): URL | undefined {
  const typed = raw.trim();
  if (!typed) return undefined;
  const host = typed.replace(SCHEME, "").split(/[/:?#]/)[0] ?? "";
  const given = SCHEME.test(typed) ? typed : `${LOOPBACK_NAME.test(host) ? "http" : "https"}://${typed}`;
  try {
    const url = new URL(given);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
