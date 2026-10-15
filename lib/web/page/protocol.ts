import type { WebArrival } from "../../../shared/types/web.ts";
import type { FrameAnchor, FrameMark, PageBox } from "./blocks.ts";

export const CHANNEL = "sidecar-web";

/** A block in the page's own viewport, which the sidecar offsets by where its frame sits. */
export interface WebHit {
  height: number;
  key: string;
  label: string;
  left: number;
  path: string;
  text: string;
  top: number;
  width: number;
}

/** `end` is the last line selected, in the page's own viewport like the hit. */
export interface WebSelection {
  end: PageBox;
  hit: WebHit;
  quote: string;
}

export interface WebPage {
  icon?: string;
  title: string;
  url: string;
}

export type WebKey =
  "address" | "back" | "comment" | "escape" | "forward" | "full" | "hold" | "reload" | "release" | "remove" | "undo";

export type AgentMessage =
  | { type: "busy"; busy: boolean }
  | { type: "down"; url: string }
  | { type: "key"; key: WebKey }
  | { type: "layout"; anchors: FrameAnchor[]; hot?: WebHit; marks: FrameMark[]; picked?: WebHit }
  | { type: "page"; how: WebArrival; page: WebPage }
  | { type: "pick"; hit: WebHit }
  | { type: "ready" }
  | { type: "select"; selection?: WebSelection };

export type SidecarMessage =
  | { type: "arm"; armed: boolean }
  | { type: "clear" }
  | { type: "hello" }
  | { type: "step"; by: -1 | 1; to: string }
  | { type: "theme"; theme: string };

export type Envelope<T> = T & { channel: typeof CHANNEL };
