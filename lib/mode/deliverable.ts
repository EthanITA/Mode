import { quote, strip } from "../text.ts";
import { AUTO } from "./constants.ts";
import { metaOf, names } from "./contracts.ts";
import { modeConfig } from "./config.ts";
import { ask, question } from "./jev.ts";
import type { Meta } from "./frontmatter.ts";
import { resolveDir } from "./paths.ts";
import { Refusal } from "./refusal.ts";
import { deliverable, held, openBoard, saveDeliverable, type Deliverable } from "./state.ts";

const INTENTS = ["answer", "change", "artifact", "post"];
// How far a change may travel. Published is its own rung: after a push for a site, after a commit for a page.
const SHIPS: Record<string, Set<string>> = {
  committed: new Set(["commit"]),
  pushed: new Set(["commit", "push"]),
  "mr-merged": new Set(["commit", "push", "mr"]),
  published: new Set(["commit", "push", "publish"]),
};
const SHIP_NAMES: Record<string, string> = {
  commit: "committed",
  push: "pushed",
  mr: "mr-merged",
  publish: "published",
};
const SHIP_SAID: Record<string, string> = {
  committed: "a commit",
  pushed: "a push",
  "mr-merged": "an MR, done when merged",
  published: "a publish",
};
const DEFAULT_SHIP = "committed";
const ACTS = ["commit", "push", "mr", "publish"];
const READ_AT = 0.6;
const ASK_CHARS = 4000;
// Arrives in the user role without anybody typing it, so it is never an ask to read.
const INJECTED = ["<", "Another Claude session sent a message", "[Request interrupted"];

const QUESTIONS = {
  change: question(
    "Does ask want files changed, such as code, config, docs, tests or rules?",
    "Yes when doing what it asks means editing files, including a fix, a refactor or a rule.",
    "No when it only wants an answer, a page to read or a message sent.",
  ),
  artifact: question(
    "Does ask want a page or document made to be opened and read, such as a report, a review, a plan page or a mockup?",
    "Yes when the result is something the user opens and keeps.",
    "No when a reply in the conversation or a change to files is enough.",
  ),
  post: question(
    "Does ask want something sent to other people under the user's name, such as a comment, a reply, a message, an email or a ticket?",
    "Yes when something written for another person reaches them because of it.",
    "No when the only thing others see is the change itself shipping, such as a commit, a push or a merge request, " +
      "or when nothing leaves the conversation and the user's own files.",
  ),
};

// What a mode can produce, from its front matter. A mode that declares nothing is not tracked at all.
export function modeDelivers(meta: Meta): string[] {
  const declared = new Set(
    (meta.deliverables ?? "")
      .split(",")
      .map((d) => strip(d).toLowerCase())
      .filter(Boolean),
  );
  return INTENTS.filter((intent) => declared.has(intent));
}

export function delivers(sid?: string): string[] {
  const name = held("mode", sid);
  return name && name !== AUTO ? modeDelivers(metaOf("mode", name)) : [];
}

const shipName = (value: string): string => SHIP_NAMES[value] ?? value;

function deliveryRows(): [string, string][] {
  const rows = modeConfig().delivery;
  return Array.isArray(rows)
    ? rows.map((row: unknown) => [String((row as unknown[])[0]), String((row as unknown[])[1])])
    : [];
}

// How a change under this path ships, and the `delivery` row that says so, matched as board-deliver does.
function projectShip(path: string): [string, string] {
  const lowered = (path || "").toLowerCase();
  for (const [tree, kind] of deliveryRows())
    if (lowered.includes(tree.toLowerCase()) && kind in SHIPS) return [kind, tree];
  return [DEFAULT_SHIP, ""];
}

function shipOf(state: Deliverable, path: string): [string, string] {
  const override = shipName(String(state.ship || ""));
  return override in SHIPS ? [override, "this ask"] : projectShip(path);
}

const said = (intents: string[]): string => intents.join(" + ");

function whereFrom(source: string): string {
  return source === "this ask" ? "set for this ask" : source ? `the \`${source}\` row` : "no `delivery` row matches";
}

export function describe(state: Deliverable, path: string): string {
  const intents = state.intents ?? [];
  let text = said(intents);
  if (intents.includes("change") || intents.includes("artifact")) {
    const [ship, source] = shipOf(state, path);
    text += `, and a change here ships as ${SHIP_SAID[ship]} (${whereFrom(source)})`;
  }
  const line = strip(String(state.line || ""));
  return text + (line ? `. ${line.replace(/\.+$/, "")}` : "") + ".";
}

export function announceDeliverable(state: Deliverable, mode: string, offered: string[], path: string): string {
  if (state.intents?.length) {
    const text = `Deliverable: ${describe(state, path)}`;
    return state.source === "jev"
      ? `${text} Jev read that from the ask, so confirm it or correct it with \`mode deliverable\`.`
      : text;
  }
  const [ship, source] = projectShip(path);
  return (
    `Deliverable: none named. Name it before the first edit with \`mode deliverable <${offered.join("|")}>... "<one line>"\`, ` +
    `since ${mode} delivers ${said(offered)} and a change here ships as ${SHIP_SAID[ship]} (${whereFrom(source)}).`
  );
}

// Why a delivery act falls outside the named deliverable, or undefined when it fits.
function check(verb: string, state: Deliverable, path: string): string | undefined {
  if (!state.intents?.length) {
    return 'No deliverable is named yet, so there is no north star to hold this to. Name it first: `mode deliverable <answer|change|artifact|post>... "<one line>"`.';
  }
  const intents = state.intents;
  const named = said(intents);
  if (verb === "edit" && !intents.includes("change")) {
    return `The deliverable is ${named}, and editing ${path || "a file"} is a change. If this ask changes files too, say so: \`mode deliverable ${intents.join(" ")} change "<one line>"\`.`;
  }
  if (verb === "artifact" && !intents.includes("artifact")) {
    return `The deliverable is ${named}, and ${path || "this page"} is an artifact. If this ask wants a page, add artifact.`;
  }
  if (verb === "post" && !intents.includes("post")) {
    return `The deliverable is ${named}, and this sends something to other people. If this ask wants that, add post.`;
  }
  if (!ACTS.includes(verb)) return undefined;
  if (!intents.includes("change") && !intents.includes("artifact")) {
    return `The deliverable is ${named}, which changes nothing, so there is nothing to ${verb}.`;
  }
  const [ship, source] = shipOf(state, path);
  if (SHIPS[ship]?.has(verb)) return undefined;
  return (
    `A change here ships as ${SHIP_SAID[ship]} (${whereFrom(source)}), so a ${verb} goes past that. If it should go further, add a ` +
    "`delivery` row for this tree in ~/.claude/mode/config.json, or say this ask ships further " +
    `with \`mode deliverable ${intents.join(" ")} --ship ${verb}\`.`
  );
}

// Jev's reading of what the ask wants, kept to what the mode delivers. Answer is what is left over.
async function read(askText: string, mode: string, offered: string[], board: string[]): Promise<string[] | undefined> {
  const text = strip(askText || "");
  if (!text || INJECTED.some((prefix) => text.startsWith(prefix))) return undefined;
  const questions = Object.fromEntries(
    offered.flatMap((name) => (name in QUESTIONS ? [[name, QUESTIONS[name as keyof typeof QUESTIONS]]] : [])),
  );
  const reading = Object.keys(questions).length
    ? await ask(questions, { ask: text.slice(0, ASK_CHARS), mode, open_board: board })
    : {};
  if (!reading) return undefined;
  const found = offered.filter((name) => (reading[name] ?? 0) >= READ_AT);
  if (found.length) return found;
  // Answer is the leftover only where the mode can answer; anywhere else a guess would be a false star.
  return offered.includes("answer") ? ["answer"] : undefined;
}

export type DeliverableArgs = { words: string[]; ship?: string; message?: string; session?: string; path?: string };

export async function deliverableCommand({
  words,
  ship,
  message,
  session,
  path,
}: DeliverableArgs): Promise<{ text?: string; code: number }> {
  const folder = resolveDir(path);
  const offered = delivers(session);
  const state = deliverable(session);
  const [verb = "", ...rest] = words;
  if (!words.length) return state.intents?.length ? { text: describe(state, folder), code: 0 } : { code: 1 };
  if (verb === "check") {
    // A mode that delivers nothing has no north star to hold an act to.
    const reason = offered.length ? check(rest[0] ?? "", state, folder) : undefined;
    return reason ? { text: reason, code: 1 } : { code: 0 };
  }
  if (verb === "read") {
    if (offered.length && !state.intents?.length) {
      const found = await read(message || "", held("mode", session), offered, openBoard(session));
      if (found) saveDeliverable(session, { intents: found, line: "", ship: "", source: "jev" });
    }
    return { code: 0 };
  }
  if (verb === "done") {
    const dropped = new Set(rest.length ? rest : INTENTS);
    saveDeliverable(session, { ...state, intents: (state.intents ?? []).filter((intent) => !dropped.has(intent)) });
    return { code: 0 };
  }
  if (!offered.length)
    throw new Refusal(`${held("mode", session) || "No mode"} tracks no deliverable, so there is nothing to name.`, 2);
  const intents = INTENTS.filter((intent) => words.includes(intent));
  if (!intents.length || intents.some((intent) => !offered.includes(intent))) {
    throw new Refusal(
      `${held("mode", session)} delivers ${offered.join(", ")}, so name one or more of those, then the one line the ask ends in.`,
      2,
    );
  }
  const shipped = shipName(ship || "");
  if (shipped && !(shipped in SHIPS))
    throw new Refusal(`--ship takes commit, push, mr or publish, not ${quote(ship ?? "")}.`, 2);
  const line = words.filter((word) => !INTENTS.includes(word)).join(" ");
  saveDeliverable(session, { intents, line, ship: shipped, source: "set" });
  return { text: describe(deliverable(session), folder), code: 0 };
}

// Every mode against how a change ships where you stand, then every project's row.
export function deliverablesReport(path?: string): string {
  const modes = names("mode").map((name) => [name, modeDelivers(metaOf("mode", name))] as const);
  const [ship, source] = projectShip(resolveDir(path));
  const width = modes.length ? Math.max(...modes.map(([name]) => name.length)) : 4;
  const out = [
    `Here a change ships as ${SHIP_SAID[ship]} (${whereFrom(source)}).`,
    "",
    `${"mode".padEnd(width)}  delivers`,
  ];
  for (const [name, offered] of modes)
    out.push(`${name.padEnd(width)}  ${offered.length ? offered.join(", ") : "nothing"}`);
  const rows = [
    ...deliveryRows().filter(([, kind]) => kind in SHIPS),
    ["anything else", DEFAULT_SHIP] as [string, string],
  ];
  const treeWidth = Math.max(...rows.map(([tree]) => tree.length));
  out.push(
    "",
    `${"project".padEnd(treeWidth)}  a change ships as`,
    ...rows.map(([tree, kind]) => `${tree.padEnd(treeWidth)}  ${SHIP_SAID[kind]}`),
  );
  return out.join("\n");
}
