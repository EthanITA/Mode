export interface WebOpenReply {
  /** Made by this open, so an entry a redirect passed through can be dropped once the redirect moves on. */
  isNew: boolean;
  port: number;
  slug: string;
  url: string;
}

export interface WebServeReply {
  /** The name the proxy's origin is given: the site's for a remote one, the entry's own for a local app. */
  jar: string;
  port: number;
  /** The site's own origin, which a page URL inside the proxy maps back onto. */
  upstream: string;
}
