export interface WebOpenReply {
  /** Made by this open, so an entry a redirect passed through can be dropped once the redirect moves on. */
  isNew: boolean;
  port: number;
  slug: string;
  url: string;
}

// The entry's own back and forward, kept in its record since the frame's history dies with the frame.
export interface WebTrail {
  at: number;
  urls: string[];
}

export type WebArrival = "push" | "reload" | "replace" | "traverse";

export interface WebServeReply {
  /** The name the proxy's origin is given: the site's for a remote one, the entry's own for a local app. */
  jar: string;
  port: number;
  /** The site's own origin, which a page URL inside the proxy maps back onto. */
  upstream: string;
}
