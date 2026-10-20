import type { FrameMark } from "~~/lib/web/page/blocks";

export type { FrameAnchor, FrameBlock, FrameMark, FramePending } from "~~/lib/web/page/blocks";

export type NotesPlace = "dock" | "float" | "over";

export interface ViewRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** The part of the window the frame is actually seen through, after every clipping ancestor. */
export interface ViewBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface FrameHit {
  clip?: ViewBox;
  height: number;
  key: string;
  label: string;
  left: number;
  page?: string;
  path: string;
  text: string;
  top: number;
  viewLeft: number;
  viewTop: number;
  width: number;
}

export interface FrameSelection {
  bottom: number;
  left: number;
  mark: FrameMark;
  path: string;
  quote: string;
  top: number;
}
