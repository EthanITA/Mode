export interface WebOpenReply {
  /** Made by this open, so an entry a redirect passed through can be dropped once the redirect moves on. */
  isNew: boolean;
  port: number;
  slug: string;
  url: string;
}

export interface WebServeReply {
  port: number;
  /** The site's own origin, which a page URL inside the proxy maps back onto. */
  upstream: string;
}
