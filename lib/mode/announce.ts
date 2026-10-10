import { AUTO, AXES, STANDING_LINES } from "./constants.ts";
import { readContract, substitute } from "./contracts.ts";
import { announceDeliverable, delivers } from "./deliverable.ts";
import { standingBlock } from "./frontmatter.ts";
import { resolveDir } from "./paths.ts";
import { position } from "./pipeline.ts";
import { outranking } from "./rules.ts";
import { deliverable, held, readState, sessionKey, statePath, writeState } from "./state.ts";

// Silence here would leave the status-line chip naming a contract whose rules nobody can read.
const unreadable = (name: string): string =>
  `Its contract could not be read, so the file for '${name}' is missing or has no standing reminder. Say so rather than improvising what it asks for.`;
const outranks = (stem: string): string =>
  `Ground rule ${stem}, which outranks any mode, style or skill that says otherwise.`;

// The whole contract on the turn it is entered, the reminder after.
export function announce({ session, path }: { session?: string; path?: string }): string {
  const folder = resolveDir(path);
  const blocks: string[] = [];
  for (const axis of AXES) {
    const name = held(axis, session);
    // auto holds no contract, so announcing it would inject the unreadable sentence forever.
    if (!name || name === AUTO) continue;
    const { body } = readContract(axis, name);
    const block = standingBlock(body);
    const head = `Active ${axis}: ${name}`;
    if (!block) {
      // Marking an unreadable contract announced would swallow the long version for good.
      blocks.push(`${head}\n\n${unreadable(name)}`);
      continue;
    }
    // Every turn, not only the first: a position restated is what keeps the pipeline from drifting.
    const lines = [position(axis, session)];
    const offered = axis === "mode" ? delivers(session) : [];
    if (offered.length) lines.push(announceDeliverable(deliverable(session), name, offered, folder));
    const said = lines.filter(Boolean).join("\n");
    const tail = said ? `\n\n${said}` : "";
    const marker = statePath(session, `.${axis}.announced`);
    if (marker && readState(marker) === name) {
      blocks.push(`${head}\n\n${block.split("\n").slice(0, STANDING_LINES).join("\n")}${tail}`);
      continue;
    }
    blocks.push(`${head}\n\n${body}${tail}`);
    if (marker) writeState(marker, name);
  }
  // Last and every turn, because a contract restated each turn beat a rule told once.
  if (sessionKey(session)) blocks.push(...outranking().map(({ stem, reminder }) => `${outranks(stem)}\n\n${reminder}`));
  return blocks.length ? substitute(blocks.join("\n\n")) : "";
}
