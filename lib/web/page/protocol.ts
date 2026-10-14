import type { FrameAnchor, FrameMark } from "./blocks.ts";

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

export interface WebPage {
  title: string;
  url: string;
}

export type WebKey = "comment" | "escape" | "full" | "hold" | "reload" | "release" | "remove" | "undo";

export type AgentMessage =
  | { type: "away"; url: string }
  | { type: "down"; url: string }
  | { type: "key"; key: WebKey }
  | { type: "layout"; anchors: FrameAnchor[]; hot?: WebHit; marks: FrameMark[]; picked?: WebHit }
  | { type: "moved"; url: string }
  | { type: "page"; page: WebPage }
  | { type: "pick"; hit: WebHit }
  | { type: "ready" };

export type SidecarMessage =
  { type: "arm"; armed: boolean } | { type: "clear" } | { type: "go"; path: string } | { type: "hello" };

export type Envelope<T> = T & { channel: typeof CHANNEL };
