import type { ReviewThread } from "~~/shared/types/artifact";
import type { FrameAnchor, FrameMark } from "~/types/frame";

export type AnchorState = "quote" | "label";

export interface Pin {
  key: string;
  label: string;
  resolved: boolean;
  state: AnchorState;
  threads: ReviewThread[];
  top: number;
  weak: boolean;
}

export interface Anchoring {
  orphans: ReviewThread[];
  pins: Pin[];
}

export interface AnchorInput {
  anchors?: FrameAnchor[];
  marks?: FrameMark[];
  threads: ReviewThread[];
}

interface Placed {
  key: string;
  label: string;
  state: AnchorState;
  top: number;
  weak: boolean;
}

const LABEL_PREFIX = 24;

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function byQuote(quote: string, marks: FrameMark[]): Placed | undefined {
  const needle = flatten(quote);
  if (!needle) return undefined;
  const hits = marks.filter((mark) => flatten(mark.text).includes(needle));
  const [first] = hits;
  if (!first) return undefined;
  return { key: first.key, label: first.label, state: "quote", top: first.top, weak: hits.length > 1 };
}

function byLabel({ anchors, label, marks }: { anchors: FrameAnchor[]; label: string; marks: FrameMark[] }): Placed | undefined {
  const needle = flatten(label).slice(0, LABEL_PREFIX);
  if (!needle) return undefined;
  const mark = marks.find((one) => flatten(one.label).startsWith(needle));
  if (mark) return { key: `label:${needle}`, label: mark.label, state: "label", top: mark.top, weak: false };
  const anchor = anchors.find((one) => flatten(one.label).startsWith(needle));
  if (!anchor) return undefined;
  return { key: `label:${needle}`, label: anchor.label, state: "label", top: anchor.top, weak: false };
}

/**
 * A thread that cannot be placed is an orphan, never a pin at the top of the page: the artifact
 * was rewritten under it and saying so beats pointing at the wrong paragraph.
 */
export function anchorThreads({ anchors = [], marks = [], threads }: AnchorInput): Anchoring {
  const orphans: ReviewThread[] = [];
  const found = new Map<string, Pin>();

  for (const thread of threads) {
    const placed =
      byQuote(thread.anchor?.quote ?? "", marks) ?? byLabel({ anchors, label: thread.anchor?.label ?? "", marks });
    if (!placed) {
      orphans.push(thread);
      continue;
    }
    const pin = found.get(placed.key);
    if (pin) {
      pin.threads.push(thread);
      pin.weak = pin.weak || placed.weak;
      continue;
    }
    found.set(placed.key, { ...placed, resolved: false, threads: [thread] });
  }

  const pins = [...found.values()].map((pin) => ({
    ...pin,
    resolved: pin.threads.every((thread) => thread.status === "resolved"),
  }));
  pins.sort((a, b) => a.top - b.top);
  return { orphans, pins };
}
