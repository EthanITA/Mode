import { newsLine } from "../lib/hook/board.ts";
import { payload, str, type Payload } from "../lib/hook/io.ts";
import { announce } from "../lib/mode/announce.ts";
import { list } from "../lib/mode/catalogue.ts";
import { AUTO, AXES } from "../lib/mode/constants.ts";
import { deliverableCommand } from "../lib/mode/deliverable.ts";
import { rulesDue } from "../lib/mode/rules.ts";
import {
  adopt,
  approve,
  axisOf,
  chips,
  choose,
  exitSlot,
  expired,
  getSlot,
  setSlot,
  standing,
} from "../lib/mode/slots.ts";
import { whyReport } from "../lib/mode/why.ts";
import { lines, strip, words } from "../lib/text.ts";
import type { Axis } from "../shared/types/mode.ts";

const ended = (name: string, axis: string, reason: string): string =>
  `The '${name}' ${axis} ended: ${reason}. Its rules no longer apply. Say that it ended and why, then work the normal way until another one is set.`;
const SET = "Set. The status line catches up when the conversation continues.";

// Claude Code caps a hook string at 10,000 characters and shows only the first 2,000 of a longer one.
const CAP = 9_500;
const overflow = (mode: string, style: string): string =>
  `Active mode: ${mode}. Active style: ${style}. This context is over Claude Code's 10,000-character hook ` +
  "limit, so only this preview is shown and the whole of it is in the file named above. Read that " +
  "file in full before anything else, because it holds the ground rules and the full mode and style " +
  "contracts, and they bind this conversation. Until then, these hold:";

// Anchored, so a quoted "/approve x" changes nothing. One token, then whatever was typed after it.
const COMMAND = /^\/(\S+)((?:[ \t]+\S+)*)/;
// Two commands in one prompt stay two, and only at a word start, or "bin/mode off" in plain text would switch the mode off.
const CHUNK = /(?<!\S)\/\S+(?:[ \t]+(?!\/)\S+)*/g;
const VERBS = ["mode", "style", "approve", "why"];
const PREFIX = "mode";
const WHY = "why";
// Not contract names, so they act on the axis of the command they were typed on.
const SLOT_WORDS = ["off", "auto"];
// A plugin command leads with <command-message>, so anchoring on <command-name> missed it entirely.
const NAME_TAG = /<command-name>\s*\/?([^<]*?)\s*<\/command-name>/;
const MSG_TAG = /<command-message>\s*\/?([^<]*?)\s*<\/command-message>/;
const ARGS_TAG = /<command-args>\s*([\s\S]*?)\s*<\/command-args>/;
const ANSI = /\x1b\[[0-9;]*m/g;

// What bin/mode would have printed, stripped, or undefined where it printed nothing or failed.
function ask(read: () => string | undefined): string | undefined {
  try {
    return strip(read() ?? "") || undefined;
  } catch {
    return undefined;
  }
}

// Whether a write went through, the in-process twin of bin/mode exiting 0.
function ran(act: () => unknown): boolean {
  try {
    act();
    return true;
  } catch {
    return false;
  }
}

function typedMessage(data: Payload): string {
  const text = strip(str(data.prompt));
  // command-name carries the slash form everywhere seen; command-message is the fallback.
  const found = NAME_TAG.exec(text) ?? MSG_TAG.exec(text);
  if (!found) return text;
  const args = ARGS_TAG.exec(text);
  return `/${strip(found[1] ?? "")} ${args ? strip(args[1] ?? "") : ""}`;
}

function parse(chunk: string): { verb: string; named: string[]; words: string[] } | undefined {
  const found = COMMAND.exec(chunk);
  if (!found) return undefined;
  let parts = (found[1] ?? "").split(":").filter(Boolean);
  if (!parts.length) return undefined;
  const namespaced = parts.length > 1 && parts[0] === PREFIX;
  if (namespaced) parts = parts.slice(1);
  // Otherwise this is somebody else's slash command and claiming it would switch an unasked slot.
  if (!namespaced && !VERBS.includes(parts[0] ?? "")) return undefined;
  const verb = VERBS.includes(parts[0] ?? "") ? parts[0] : undefined;
  return { verb: verb ?? PREFIX, named: parts.slice(verb ? 1 : 0), words: words(found[2] ?? "") };
}

type Obeyed = { done: Set<string>; bare: string[]; spare: string; shown: string[] };

// The switch itself, so a slot changes because someone typed it rather than because the model felt like it.
function obey(message: string, session: string | undefined, cwd: string): Obeyed {
  const done = new Set<string>();
  const bare: string[] = [];
  const spare: string[] = [];
  const shown: string[] = [];
  let end = 0;
  for (const found of message.matchAll(CHUNK)) {
    spare.push(message.slice(end, found.index));
    end = found.index + found[0].length;
    const parsed = parse(found[0]);
    if (!parsed) {
      spare.push(found[0]);
      continue;
    }
    const { verb, named } = parsed;
    const all = [...named, ...parsed.words];
    if (verb === "approve") {
      // Read only from the typed message: anything an agent can reach could approve its own spec.
      if (all.length) ask(() => approve({ slug: all[0], session }));
      spare.push(...all.slice(1));
      continue;
    }
    if (verb === WHY) {
      shown.push(ask(() => whyReport({ session, path: cwd })) ?? "");
      spare.push(...all);
      continue;
    }
    if (!all.length) {
      bare.push(verb === "mode" || verb === "style" ? verb : PREFIX);
      continue;
    }
    all.forEach((arg, index) => {
      // /mode why is the same question as /why, so the word answers wherever it is typed.
      if (arg === WHY && !ask(() => axisOf(arg))) {
        shown.push(ask(() => whyReport({ session, path: cwd })) ?? "");
        return;
      }
      const owner = ask(() => axisOf(arg));
      // So /mode native reaches the style slot instead of failing quietly against the mode one.
      const axis = (SLOT_WORDS.includes(arg) ? verb : (owner ?? verb)) as Axis;
      let known = !!owner || SLOT_WORDS.includes(arg);
      // The first name per axis wins, so names can arrive in any order and a duplicate is noise.
      if (!done.has(axis) && ran(() => setSlot({ axis, session, name: arg }))) {
        done.add(axis);
        known = true;
      }
      // A word the tool cannot place is the ask, not an argument, so the turn still owes an answer.
      if (!known && index >= named.length) spare.push(arg);
    });
  }
  spare.push(message.slice(end));
  return { done, bare, spare: strip(spare.join(" ")), shown: shown.filter(Boolean) };
}

// Retires a contract whose exit condition is met, and answers with the line saying so.
function expire(axis: Axis, session: string | undefined): string {
  const reason = ask(() => expired({ axis, session }));
  if (!reason) return "";
  const name = ask(() => getSlot({ axis, session }));
  // exit puts a chosen slot back on auto, so the chooser below can refill it from this same message.
  ask(() => exitSlot({ axis, session }));
  return name ? ended(name, axis, reason.replace(/[. ]+$/, "")) : "";
}

// What the slot holds and how it came to, read off the chip, the same call the status line makes.
function holding(axis: Axis, session: string | undefined): [name: string, source: string] {
  const row = (ask(() => getSlot({ axis, session, chip: true })) ?? "").split("\t");
  return [strip(row[0] ?? ""), row.length > 2 ? strip(row[2] ?? "") : ""];
}

// What a person reads when the turn ends in the hook: the choices for a bare axis, or the chips with each held contract's line.
function settled(bare: string[], session: string | undefined): string {
  const listed = bare.map((axis) => ask(() => list({ axis: axis as Axis, session })));
  if (listed.some(Boolean)) return listed.filter(Boolean).join("\n\n");
  const rows = lines(ask(() => list({ tsv: true, session })) ?? "").map((row) => row.split("\t"));
  const held = rows.filter((row) => row.length > 3 && row[3] === "active").map((row) => `${row[1]}: ${row[2]}`);
  const shownChips = (ask(() => chips(session)) ?? "").replace(ANSI, "");
  return strip([shownChips, ...held, "", SET].join("\n"));
}

function enter(axis: Axis, message: string, session: string | undefined): void {
  const name = ask(() => choose({ axis, session, message }));
  // --chosen marks the slot as filled by the chooser, so an ended contract can return to auto.
  if (name) ran(() => setSlot({ axis, session, name, chosen: true }));
}

function emit(output: object): void {
  process.stdout.write(JSON.stringify(output) + "\n");
}

try {
  const data = payload() ?? {};
  const session = str(data.session_id) || undefined;
  const cwd = str(data.cwd) || process.cwd();
  const message = typedMessage(data);

  // Before anything reads a slot, and every prompt: adopt walks past an axis already decided.
  ran(() => adopt({ path: cwd, session }));

  // Judged before the switch, so an exit condition retires the contract the turn began in.
  const blocks = AXES.map((axis) => expire(axis, session)).filter(Boolean);
  const { done, bare, spare, shown } = obey(message, session, cwd);

  // Leaving rules and announce uncalled is the point: the contract still lands on the first real ask.
  if (!blocks.length && !spare && (done.size || bare.length || shown.length)) {
    emit({
      decision: "block",
      reason: shown.length ? shown.join("\n\n") : settled(bare, session),
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true },
    });
  } else {
    for (const axis of AXES) {
      const [name, source] = holding(axis, session);
      // A pin is a default, so the chooser may still hand it to a contract that opts in to taking one.
      if (!done.has(axis) && (name === AUTO || source === "pinned")) enter(axis, message, session);
    }

    // Once per conversation each: base rules on the first prompt, scoped ones when their trigger shows.
    const told = ask(() => rulesDue({ session, message }));
    if (told) blocks.unshift(told);
    // Asked alongside real words rather than alone, so the report rides the turn instead of ending it.
    blocks.push(...shown);
    const board = newsLine(str(data.session_id));
    if (board) blocks.push(board);

    // Before the announce, so a fresh ask already carries Jev's reading of what it should deliver.
    if (spare) {
      try {
        await deliverableCommand({ words: ["read"], message: spare, path: cwd, session });
      } catch {}
    }

    // One call, because lib/mode owns whether this prompt gets the whole contract or the reminder.
    const announced = ask(() => announce({ session, path: cwd }));
    if (announced) blocks.push(announced);

    if (blocks.length) {
      let context = blocks.join("\n\n");
      if (context.length > CAP) {
        const [mode = "none", style = "none"] = AXES.map((axis) => ask(() => getSlot({ axis, session })) ?? "none");
        // The north star rides in the preview, since the first turn is when it has to be named.
        const north = lines(announced ?? "").find((line) => line.startsWith("Deliverable:")) ?? "";
        context = [overflow(mode, style), north, ask(() => standing(session)) ?? "", context]
          .filter(Boolean)
          .join("\n\n");
      }
      // additionalContext reaches the model only; the surface a person watches is the status-line chip.
      emit({
        hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
        suppressOutput: true,
      });
    }
  }
} catch {}
