import type { BaselineOrigin, DiffTarget, FileDiff, FileVersions } from "~~/shared/types/versions";

export type DiffState =
  | { kind: "changed"; rows: DiffRow[]; added: number; removed: number }
  | { kind: "unchanged" }
  | { kind: "absent"; reason: string }
  | { kind: "unknown"; reason: string };

export interface DiffRow {
  kind: "add" | "context" | "hunk" | "remove";
  text: string;
}

export interface DiffNote {
  tone: "loud" | "quiet";
  text: string;
}

export interface DiffReading {
  file: FileVersions;
  to: DiffTarget;
  diff?: FileDiff;
}

function assertNever(value: never): never {
  throw new Error(`unhandled ${JSON.stringify(value)}`);
}

function parse(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const line of patch.split("\n")) {
    if (!line) continue;
    if (line.startsWith("@@")) {
      rows.push({ kind: "hunk", text: line.replace(/^@@[^@]*@@\s?/, "") || line });
      continue;
    }
    // `--- a/x` and `+++ b/x` open with the same characters as a real removal.
    if (/^(diff |index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode|Binary files)/.test(line)) {
      if (line.startsWith("Binary files")) rows.push({ kind: "hunk", text: "binary file — no line-by-line diff" });
      continue;
    }
    if (line.startsWith("+")) rows.push({ kind: "add", text: line.slice(1) });
    else if (line.startsWith("-")) rows.push({ kind: "remove", text: line.slice(1) });
    else if (line.startsWith("\\")) continue;
    else rows.push({ kind: "context", text: line.slice(1) });
  }
  return rows;
}

/**
 * Every gap the store can report is a different sentence. Collapsing any of them into an empty
 * pane would tell the reader nothing happened, which is the one thing that must never be said
 * about a change we could not compute.
 */
function read({ file, to, diff }: DiffReading): DiffState {
  if (!diff) return { kind: "unknown", reason: "the diff request never came back" };

  if (!diff.computed) {
    switch (diff.reason) {
      case "skipped":
        return { kind: "absent", reason: `not versioned — ${file.skipped || "it was over the size budget"}` };
      case "unknown-baseline":
        return {
          kind: "unknown",
          reason: "what stood before this file was first touched could not be reconstructed, so there is nothing to measure against",
        };
      case "unresolved-target":
        return {
          kind: "absent",
          reason:
            to === "next"
              ? "nothing came after this turn — this is the newest version of the file"
              : "there is no version of this file at the point being compared against",
        };
      case "missing-content":
        return { kind: "absent", reason: "no version of this file was stored for this turn" };
      case "store-failed":
        return { kind: "unknown", reason: "the version store could not be read" };
      default:
        return assertNever(diff.reason);
    }
  }

  const rows = parse(diff.patch);
  // A binary patch reports its counts as "-", which reaches us as 0, so the patch outranks them.
  if (rows.length) return { kind: "changed", rows, added: diff.added, removed: diff.removed };
  return { kind: "unchanged" };
}

/** An unknown baseline is an honest gap and says so; a reconstructed one is a good answer, quietly. */
function baselineNote(baseline: BaselineOrigin): DiffNote | undefined {
  switch (baseline) {
    case "exact":
      return undefined;
    case "absent":
      return { tone: "quiet", text: "this file did not exist before the conversation touched it" };
    case "reconstructed":
      return { tone: "quiet", text: "this file's baseline was walked back from the edits, not recorded" };
    case "unknown":
      return {
        tone: "loud",
        text: "what stood before this file was first touched could not be reconstructed, so the first change shown here is measured against an unknown starting point",
      };
    default:
      return assertNever(baseline);
  }
}

function stateNote(state: DiffState): DiffNote | undefined {
  switch (state.kind) {
    case "changed":
      return undefined;
    case "unchanged":
      return { tone: "quiet", text: "no change between these two points" };
    case "absent":
      return { tone: "quiet", text: state.reason };
    // Each reason stands as its own sentence, so nothing reads "could not" twice in one line.
    case "unknown":
      return { tone: "loud", text: state.reason };
    default:
      return assertNever(state);
  }
}

export const Diff = { baselineNote, read, stateNote };
