export interface FrameAnchor {
  label: string;
  top: number;
}

export interface FrameBlock {
  height: number;
  top: number;
}

/** A block the frame can name as well as place, so a comment can outlive one render of it. */
export interface FrameMark extends FrameBlock {
  key: string;
  label: string;
  text: string;
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

export interface FramePending {
  id: string;
  left: number;
  path: string;
  replacement: string;
  top: number;
}
