const MARKER = /\[\[mode-relay v1(?: slug=([A-Za-z0-9._-]+))?\]\]\n?/
// The separator after the colon is a space in some builds and a newline in others.
const WRAP = /^Another Claude session sent a message:\s*/
const PEER_NOTE = "This came from another Claude session"

export function marked(text: string, slug?: string): string {
  return `[[mode-relay v1${slug ? ` slug=${slug}` : ""}]]\n${text}`
}

// The harness records a queued copy and a wrapped one; only normalised do the two compare equal.
export function plain(text: string): string {
  const body = text.replace(WRAP, "")
  if (!MARKER.test(body)) return text
  const stripped = body.replace(MARKER, "")
  const cut = stripped.lastIndexOf(PEER_NOTE)
  return (cut < 0 ? stripped : stripped.slice(0, cut)).trim()
}
