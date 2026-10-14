import type { TurnReceipt } from "~~/shared/types/receipts";
import type { SessionStatus } from "~~/shared/types/session";
import type { ConversationVersions, FileVersion, FileVersions } from "~~/shared/types/versions";
import { basename } from "./label.ts";

export type TurnState = "done" | "running" | "waiting";

export type TurnFileKind = "changed" | "created" | "deleted" | "unchanged";

export interface TurnFile {
  path: string;
  name: string;
  kind: TurnFileKind;
  /** Absent while the store holds no version of the file from this turn. */
  churn?: { added: number; removed: number };
}

export interface Turn {
  turn: number;
  at: number;
  prompt?: string;
  reply?: string;
  agents: string[];
  /** Agent work after the session went quiet, which no prompt opened. */
  isOpen: boolean;
  state: TurnState;
  files: TurnFile[];
  added: number;
  removed: number;
  commands: number;
}

export interface TurnsInput {
  receipts: TurnReceipt[];
  versions?: ConversationVersions;
  replies: Map<number, string>;
  status?: SessionStatus;
}

export interface RestorePlan {
  isEnabled: boolean;
  tip: string;
}

export interface RestoreQuery {
  turn: Turn;
  file: TurnFile;
  versions?: ConversationVersions;
}

const SPAWN = /^spawned\s/;
const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });

function kindOf({
  entry,
  version,
  isDeleted,
  isWritten,
  isSettled,
  isCapped,
}: {
  entry?: FileVersions;
  version?: FileVersion;
  isDeleted: boolean;
  isWritten: boolean;
  isSettled: boolean;
  isCapped: boolean;
}): TurnFileKind {
  if (version) return version.deleted ? "deleted" : version.created ? "created" : "changed";
  // A finished turn the store committed with no difference left the file as it found it.
  if (isSettled && entry && !entry.skipped && entry.versions.length > 0) return "unchanged";
  // The store lists no entry without a version, so a file made and removed inside the turn has none at all.
  if (isSettled && !entry && !isCapped && isWritten && isDeleted) return "unchanged";
  return isDeleted ? "deleted" : "changed";
}

function stateOf({
  receipt,
  newest,
  status,
}: {
  receipt: TurnReceipt;
  newest?: number;
  status?: SessionStatus;
}): TurnState {
  if (receipt.turn !== newest || !status || status === "idle") return "done";
  return status === "waiting" ? "waiting" : "running";
}

/** Newest first, the order the list reads in. */
function build({ receipts, versions, replies, status }: TurnsInput): Turn[] {
  const stored = new Map((versions?.files ?? []).map((one) => [one.path, one]));
  const newest = receipts.at(-1)?.turn;
  const turns = receipts.map((receipt): Turn => {
    const deleted = new Set(receipt.deleted);
    const state = stateOf({ receipt, newest, status });
    // The receipt decides which files a turn touched, so a file the store skipped still shows.
    const paths = [...new Set([...receipt.wrote, ...receipt.deleted])];
    const names = paths.map((path) => basename(path));
    const files = paths.map((path, at): TurnFile => {
      const entry = stored.get(path);
      const version = entry?.versions.find((one) => one.turn === receipt.turn);
      return {
        path,
        name:
          names.indexOf(names[at]!) === names.lastIndexOf(names[at]!)
            ? names[at]!
            : path.split("/").slice(-2).join("/"),
        kind: kindOf({
          entry,
          version,
          isDeleted: deleted.has(path),
          isWritten: receipt.wrote.includes(path),
          isSettled: state === "done" && !!receipt.prompt,
          isCapped: !!versions?.capped,
        }),
        churn: version ? { added: version.added, removed: version.removed } : undefined,
      };
    });
    return {
      turn: receipt.turn,
      at: receipt.at,
      prompt: receipt.prompt,
      reply: replies.get(receipt.turn),
      agents: receipt.by ?? [],
      isOpen: !receipt.prompt,
      state,
      files,
      added: files.reduce((sum, one) => sum + (one.churn?.added ?? 0), 0),
      removed: files.reduce((sum, one) => sum + (one.churn?.removed ?? 0), 0),
      commands: receipt.ran.filter((one) => !SPAWN.test(one.command)).length,
    };
  });
  return turns.reverse();
}

function laterLine(later: number[]): string {
  const [only] = later;
  if (later.length === 1) return `Turn ${only} also changed it, so its edits go too.`;
  return `Turns ${LIST.format(later.map(String))} also changed it, so their edits go too.`;
}

function pointOf(turn: Turn): string {
  return turn.isOpen ? "this work" : `turn ${turn.turn}`;
}

/** Restore always means "before this turn": the store's end of the turn before it. */
function restoreOf({ turn, file, versions }: RestoreQuery): RestorePlan {
  const blocked = (tip: string): RestorePlan => ({ isEnabled: false, tip });
  const point = pointOf(turn);
  const label = turn.isOpen ? "This work" : `Turn ${turn.turn}`;
  // Claude may still be writing the file, so a restore now could land under its next edit.
  if (turn.state === "running") return blocked(`${label} is still running. Restore once it ends.`);
  if (turn.state === "waiting") return blocked(`${label} is waiting on you. Restore once it ends.`);
  if (file.kind === "unchanged")
    return blocked(`${file.name} ended ${point} the way it started, so there's nothing to put back.`);
  const entry: FileVersions | undefined = versions?.files.find((one) => one.path === file.path);
  const own = entry?.versions.find((one) => one.turn === turn.turn);
  if (!entry || !own) {
    if (entry?.skipped) return blocked(`${file.name} was never versioned, so there's nothing to put back.`);
    // An agent's late edits reach the receipts before the store, which only rebuilds when the transcript grows.
    if (turn.isOpen) return blocked(`${file.name} isn't in the version store yet.`);
    return blocked(`The version store kept no copy of ${file.name} from ${point}, so there's nothing to put back.`);
  }
  const earlier = entry.versions.filter((one) => one.turn < turn.turn).at(-1);
  const unborn = `${file.name} didn't exist before ${point}, so there's nothing to put back.`;
  if (earlier?.deleted) return blocked(unborn);
  if (!earlier && entry.baseline === "unknown")
    return blocked(`What ${file.name} looked like before ${point} was never recorded.`);
  if (!earlier && (own.created || entry.baseline === "absent")) return blocked(unborn);
  const later = [...new Set(entry.versions.filter((one) => one.turn > turn.turn).map((one) => one.turn))];
  const lead = `${own.deleted ? "Bring" : "Put"} ${file.name} back the way it was before ${point}`;
  return { isEnabled: true, tip: later.length ? `${lead}. ${laterLine(later)}` : lead };
}

export const Turns = { build, pointOf, restoreOf };
