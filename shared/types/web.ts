export interface WebOpenReply {
  port: number;
  slug: string;
  url: string;
}

export interface WebServeReply {
  port: number;
  /** The site's own origin, which a page URL inside the proxy maps back onto. */
  upstream: string;
}
