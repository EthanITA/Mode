import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Axis } from "../../shared/types/mode.ts";
import { readTextSafe, writeText } from "../files.ts";
import { lines, pyJson, strip } from "../text.ts";
import { FALSEY, GREEN, RED } from "./constants.ts";
import { configRoot, modeHome, stateHome } from "./paths.ts";
import { Refusal } from "./refusal.ts";

export type Deliverable = { intents?: string[]; line?: string; ship?: string; source?: string };

export function sessionKey(sid?: string): string {
  return (sid || process.env.CLAUDE_CODE_SESSION_ID || "").slice(0, 8);
}

export function statePath(sid: string | undefined, suffix: string): string | undefined {
  const key = sessionKey(sid);
  return key ? join(stateHome(), `session-${key}${suffix}`) : undefined;
}

export function require(path: string | undefined): string {
  if (!path) throw new Refusal("no session id: pass --session ID or set CLAUDE_CODE_SESSION_ID");
  return path;
}

export function readState(path?: string): string {
  for (const line of lines(readTextSafe(path) ?? "")) if (strip(line)) return strip(line);
  return "";
}

export function writeState(path: string, value: string): void {
  writeText(path, `${value}\n`);
}

export function removeState(path?: string): void {
  if (path) rmSync(path, { force: true });
}

// One small file read and nothing else, because the status line calls this on every render.
export function held(axis: Axis, sid?: string): string {
  return readState(statePath(sid, `.${axis}`));
}

function marked(axis: Axis, sid: string | undefined, kind: "chosen" | "pinned"): boolean {
  const name = held(axis, sid);
  return !!name && readState(statePath(sid, `.${axis}.${kind}`)) === name;
}

export function sourceOf(axis: Axis, sid?: string): "chosen" | "pinned" | undefined {
  if (marked(axis, sid, "chosen")) return "chosen";
  return marked(axis, sid, "pinned") ? "pinned" : undefined;
}

// Set once an axis is decided however it was decided, so `off` leaves a trace a pin cannot fill back in.
export function settled(axis: Axis, sid?: string): string | undefined {
  return statePath(sid, `.${axis}.settled`);
}

export function dropSlot(axis: Axis, sid?: string): void {
  for (const suffix of ["", ".chosen", ".pinned", ".announced", ".done"])
    removeState(statePath(sid, `.${axis}${suffix}`));
  // An approval outlives its mode only as a gate nobody meant to leave open, and so does a north star.
  if (axis === "mode") for (const suffix of [".approved", ".deliverable"]) removeState(statePath(sid, suffix));
}

export function deliverable(sid?: string): Deliverable {
  try {
    const found: unknown = JSON.parse(readTextSafe(statePath(sid, ".deliverable")) ?? "{}");
    return typeof found === "object" && found && !Array.isArray(found) ? (found as Deliverable) : {};
  } catch {
    return {};
  }
}

export function saveDeliverable(sid: string | undefined, state: Deliverable): void {
  const path = require(statePath(sid, ".deliverable"));
  if (!state.intents?.length) return removeState(path);
  writeText(path, pyJson(state) + "\n");
}

// The open board items, so a bare "go" reads against what is already in flight.
export function openBoard(sid?: string): string[] {
  const folder = join(configRoot(), "tasks", `session-${sessionKey(sid)}`);
  let files: string[];
  try {
    files = readdirSync(folder)
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return [];
  }
  const subjects: string[] = [];
  for (const file of files) {
    try {
      const task: unknown = JSON.parse(readTextSafe(join(folder, file)) ?? "");
      if (typeof task !== "object" || !task || Array.isArray(task)) continue;
      const { status, subject } = task as { status?: unknown; subject?: unknown };
      if (status !== "completed" && subject) subjects.push(String(subject));
    } catch {}
  }
  return subjects;
}

// A record carries the mode it was made under, so one mode's record cannot satisfy another.
export function stamp(name: string, value: string): string {
  return `${value}\t${name}`;
}

function under(name: string, line: string): string {
  const tab = line.indexOf("\t");
  const value = tab < 0 ? line : line.slice(0, tab);
  const mode = tab < 0 ? "" : line.slice(tab + 1);
  return strip(mode) === name ? strip(value) : "";
}

export function approvedSlug(sid?: string, anyMode = false): string {
  const name = held("mode", sid);
  for (const line of lines(readTextSafe(statePath(sid, ".approved")) ?? "")) {
    if (!strip(line)) continue;
    // Ignoring the stamp answers "was anything ever approved", the only way to tell a wrong-mode deny from no yes.
    return anyMode ? strip(line.split("\t")[0] ?? "") : under(name, line);
  }
  return "";
}

// In the order it landed, because for a pair that cancels out, such as a failure and its pass, only the order says which stands.
export function ledger(axis: Axis, sid?: string): string[] {
  const name = held(axis, sid);
  return lines(readTextSafe(statePath(sid, `.${axis}.done`)) ?? "")
    .filter((line) => strip(line))
    .map((line) => under(name, line))
    .filter(Boolean)
    .map((reason) => reason.toLowerCase());
}

export function declared(axis: Axis, sid?: string): Set<string> {
  return new Set(ledger(axis, sid));
}

// A watched failure with no pass recorded after it, which is what a red-first gate opens on.
export function redStanding(sid?: string): boolean {
  const reason = ledger("mode", sid).findLast((entry) => entry === RED || entry === GREEN);
  return reason === RED;
}

export function guardsArmed(): boolean {
  try {
    const data: unknown = JSON.parse(readTextSafe(join(modeHome(), "config.json")) ?? "");
    const raw = (data as { guards?: unknown }).guards;
    const value = strip(String(raw ?? ""))
      .replace(/^["']+|["']+$/g, "")
      .toLowerCase();
    return !value || !FALSEY.has(value);
  } catch {
    return true;
  }
}
