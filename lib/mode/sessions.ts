import { readdirSync } from "node:fs";
import type { Axis, Pipeline, Slot } from "../../shared/types/mode.ts";
import { AUTO } from "./constants.ts";
import { metaOf } from "./contracts.ts";
import { stateHome } from "./paths.ts";
import { pipelineFor } from "./pipeline.ts";
import { held, sourceOf } from "./state.ts";

export type Session = { id: string; slots: { mode: Slot; style: Slot }; pipeline?: Pipeline };

// Unset and literal `auto` both name no contract; a consumer renders "off" on a missing name.
export function slotOf(axis: Axis, sid?: string): Slot {
  const name = held(axis, sid);
  if (!name || name === AUTO) return { how: "auto" };
  const meta = metaOf(axis, name);
  return { name, how: sourceOf(axis, sid) || "typed", summary: meta.summary, color: meta.color };
}

export function sessions(): Session[] {
  let entries: string[];
  try {
    entries = readdirSync(stateHome());
  } catch {
    return [];
  }
  const ids = new Set(entries.flatMap((entry) => /^session-([0-9a-f]{8})\./.exec(entry)?.[1] ?? []));
  return [...ids]
    .sort()
    .map((id) => ({ id, slots: { mode: slotOf("mode", id), style: slotOf("style", id) }, pipeline: pipelineFor(id) }));
}
