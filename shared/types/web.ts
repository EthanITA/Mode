export interface WebOpenReply {
  /** Made by this open, rather than an artifact of the conversation already showing the address. */
  isNew: boolean;
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
  port: number;
}
