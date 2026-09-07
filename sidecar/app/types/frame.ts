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

export interface FrameSelection {
  bottom: number;
  left: number;
  mark: FrameMark;
  quote: string;
  top: number;
}
