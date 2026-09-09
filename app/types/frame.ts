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

export interface FrameHit {
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
  replacement: string;
  selection: string;
  top: number;
}
