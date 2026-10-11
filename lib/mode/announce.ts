import type { Axis } from "../../shared/types/mode.ts";
import { readTextSafe } from "../files.ts";
import { strip } from "../text.ts";
import { AUTO, AXES } from "./constants.ts";
import { readContract, substitute } from "./contracts.ts";
import { announceDeliverable, delivers } from "./deliverable.ts";
import { standingBlock } from "./frontmatter.ts";
import { resolveDir } from "./paths.ts";
import { position } from "./pipeline.ts";
import { outranking } from "./rules.ts";
import { deliverable, forgetAnnounced, held, readState, sessionKey, statePath, writeState } from "./state.ts";

// Silence here would leave the status-line chip naming a contract whose rules nobody can read.
const unreadable = (name: string): string =>
  `Its contract could not be read, so the file for '${name}' is missing or has no standing reminder. Say so rather than improvising what it asks for.`;
const outranks = (stem: string): string =>
  `Ground rule ${stem}, which outranks any mode, style or skill that says otherwise.`;
const switched = (axis: string, from: string, to: string): string =>
  `The ${axis} switched from ${from} to ${to}. The ${from} contract no longer applies: comply with the ${to} contract below from now on.`;
const left = (axis: string, from: string): string =>
  `The ${axis} ${from} is off now. Its contract no longer applies, so work the normal way until another one is set.`;

type AxisTurn = { axis: Axis; session?: string; folder: string; fresh: boolean };

// fresh is a start, where nothing injected before survives, so the held contract goes out whole with no switch line.
function axisBlock({ axis, session, folder, fresh }: AxisTurn): string {
  const name = held(axis, session);
  const marker = statePath(session, `.${axis}.announced`);
  const before = fresh ? "" : readState(marker);
  if (!name || name === AUTO) {
    forgetAnnounced(axis, session);
    // Turned off by a prompt the hook answered itself, so the model hears it here or keeps working under it.
    return before ? left(axis, before) : "";
  }
  const { body } = readContract(axis, name);
  const head = `Active ${axis}: ${name}`;
  // Marking an unreadable contract announced would swallow the long version for good.
  if (!standingBlock(body)) return `${head}\n\n${unreadable(name)}`;
  const lines = [position(axis, session)];
  const offered = axis === "mode" ? delivers(session) : [];
  if (offered.length) lines.push(announceDeliverable(deliverable(session), name, offered, folder));
  const said = lines.filter(Boolean).join("\n");
  const saidMarker = statePath(session, `.${axis}.said`);
  // A held contract is already in context, so an unchanged turn sends only a position or deliverable that moved.
  if (marker && before === name) {
    if (!said || strip(readTextSafe(saidMarker) ?? "") === said) return "";
    if (saidMarker) writeState(saidMarker, said);
    return `${head}\n\n${said}`;
  }
  if (marker) writeState(marker, name);
  if (saidMarker) writeState(saidMarker, said);
  const opener = before ? `${head}\n\n${switched(axis, before, name)}` : head;
  return `${opener}\n\n${body}${said ? `\n\n${said}` : ""}`;
}

export function announce({ session, path }: { session?: string; path?: string }): string {
  const folder = resolveDir(path);
  const blocks = AXES.map((axis) => axisBlock({ axis, session, folder, fresh: false })).filter(Boolean);
  // Every turn and last, so the rule that outranks the contracts is the final word before each reply.
  if (sessionKey(session)) blocks.push(...outranking().map(({ stem, reminder }) => `${outranks(stem)}\n\n${reminder}`));
  return blocks.length ? substitute(blocks.join("\n\n")) : "";
}

export function startContract({ axis, session, path }: { axis: Axis; session?: string; path?: string }): string {
  const block = axisBlock({ axis, session, folder: resolveDir(path), fresh: true });
  return block ? substitute(block) : "";
}
