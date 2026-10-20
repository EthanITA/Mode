import type { Axis } from "./types.ts";
import { readTextSafe } from "../files.ts";
import { strip } from "../text.ts";
import { AUTO, AXES, HOOK_CAP } from "./constants.ts";
import { readContract, substitute } from "./contracts.ts";
import { standingBlock } from "./frontmatter.ts";
import { position } from "./pipeline.ts";
import { outranking } from "./rules.ts";
import { forgetAnnounced, held, readState, sessionKey, statePath, writeState } from "./state.ts";

// Silence here would leave the status-line chip naming a contract whose rules nobody can read.
const unreadable = (name: string): string =>
  `Its contract could not be read, so the file for '${name}' is missing or has no standing reminder. Say so rather than improvising what it asks for.`;
const outranks = (stem: string): string =>
  `Ground rule ${stem}, which outranks any mode, style or skill that says otherwise.`;
const switched = (axis: string, from: string, to: string): string =>
  `The ${axis} switched from ${from} to ${to}. The ${from} contract no longer applies: comply with the ${to} contract below from now on.`;
const left = (axis: string, from: string): string =>
  `The ${axis} ${from} is off now. Its contract no longer applies, so work the normal way until another one is set.`;
const deferred = (axis: string, name: string): string =>
  `Active ${axis}: ${name}\n\nThe ${axis} switched to ${name}, and its contract arrives with the next prompt because it does not fit in one hook beside the mode's. Until then, work under the ground rules and the mode.`;

type AxisTurn = { axis: Axis; session?: string; fresh: boolean };
type Block = { axis: Axis; name: string; text: string; whole: boolean; commit: () => void };

// fresh is a start, where nothing injected before survives, so the held contract goes out whole with no switch line.
function axisBlock({ axis, session, fresh }: AxisTurn): Block | undefined {
  const name = held(axis, session);
  const marker = statePath(session, `.${axis}.announced`);
  const before = fresh ? "" : readState(marker);
  const forget = (): void => forgetAnnounced(axis, session);
  if (!name || name === AUTO) {
    if (!before) {
      forget();
      return undefined;
    }
    // Turned off by a prompt the hook answered itself, so the model hears it here or keeps working under it.
    return { axis, name, text: left(axis, before), whole: false, commit: forget };
  }
  const { body } = readContract(axis, name);
  const head = `Active ${axis}: ${name}`;
  // Marking an unreadable contract announced would swallow the long version for good.
  if (!standingBlock(body))
    return { axis, name, text: `${head}\n\n${unreadable(name)}`, whole: false, commit: () => {} };
  const said = position(axis, session);
  const saidMarker = statePath(session, `.${axis}.said`);
  const remember = (): void => {
    if (saidMarker) writeState(saidMarker, said);
  };
  // A held contract is already in context, so an unchanged turn sends only a position that moved.
  if (marker && before === name) {
    if (!said || strip(readTextSafe(saidMarker) ?? "") === said) return undefined;
    return { axis, name, text: `${head}\n\n${said}`, whole: false, commit: remember };
  }
  const opener = before ? `${head}\n\n${switched(axis, before, name)}` : head;
  return {
    axis,
    name,
    text: `${opener}\n\n${body}${said ? `\n\n${said}` : ""}`,
    whole: true,
    commit: () => {
      if (marker) writeState(marker, name);
      remember();
    },
  };
}

export function announce({ session, room = HOOK_CAP }: { session?: string; room?: number }): string {
  const parts = AXES.map((axis) => axisBlock({ axis, session, fresh: false })).filter((part): part is Block => !!part);
  // Every turn and last, so the rule that outranks the contracts is the final word before each reply.
  const reminders = sessionKey(session)
    ? outranking().map(({ stem, reminder }) => `${outranks(stem)}\n\n${reminder}`)
    : [];
  const size = (): number => [...parts.map(({ text }) => text), ...reminders].join("\n\n").length;
  const style = parts.find((part) => part.axis === "style" && part.whole);
  // Two whole contracts on one prompt can outgrow a hook, so the style waits a prompt and says so instead of spilling to a file.
  if (style && parts.some((part) => part.axis === "mode" && part.whole) && size() > room) {
    style.text = deferred("style", style.name);
    style.commit = () => {};
  }
  for (const part of parts) part.commit();
  const blocks = [...parts.map(({ text }) => text), ...reminders];
  return blocks.length ? substitute(blocks.join("\n\n")) : "";
}

export function startContract({ axis, session }: { axis: Axis; session?: string }): string {
  const part = axisBlock({ axis, session, fresh: true });
  if (!part) return "";
  part.commit();
  return substitute(part.text);
}
