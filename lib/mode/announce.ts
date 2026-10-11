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

// The whole contract when it is entered or switched, then only the lines that changed since.
export function announce({ session, path }: { session?: string; path?: string }): string {
  const folder = resolveDir(path);
  const blocks: string[] = [];
  for (const axis of AXES) {
    const name = held(axis, session);
    const marker = statePath(session, `.${axis}.announced`);
    const before = readState(marker);
    // auto holds no contract, so announcing it would inject the unreadable sentence forever.
    if (!name || name === AUTO) {
      // Turned off by a prompt the hook answered itself, so the model hears it here or keeps working under it.
      if (before) blocks.push(left(axis, before));
      forgetAnnounced(axis, session);
      continue;
    }
    const { body } = readContract(axis, name);
    const block = standingBlock(body);
    const head = `Active ${axis}: ${name}`;
    if (!block) {
      // Marking an unreadable contract announced would swallow the long version for good.
      blocks.push(`${head}\n\n${unreadable(name)}`);
      continue;
    }
    const lines = [position(axis, session)];
    const offered = axis === "mode" ? delivers(session) : [];
    if (offered.length) lines.push(announceDeliverable(deliverable(session), name, offered, folder));
    const said = lines.filter(Boolean).join("\n");
    const saidMarker = statePath(session, `.${axis}.said`);
    // A held contract is already in context, so an unchanged turn sends only a position or deliverable that moved.
    if (marker && before === name) {
      if (said && strip(readTextSafe(saidMarker) ?? "") !== said) {
        blocks.push(`${head}\n\n${said}`);
        if (saidMarker) writeState(saidMarker, said);
      }
      continue;
    }
    const opener = before ? `${head}\n\n${switched(axis, before, name)}` : head;
    blocks.push(`${opener}\n\n${body}${said ? `\n\n${said}` : ""}`);
    if (marker) writeState(marker, name);
    if (saidMarker) writeState(saidMarker, said);
  }
  // Every turn and last, so the rule that outranks the contracts is the final word before each reply.
  if (sessionKey(session)) blocks.push(...outranking().map(({ stem, reminder }) => `${outranks(stem)}\n\n${reminder}`));
  return blocks.length ? substitute(blocks.join("\n\n")) : "";
}
