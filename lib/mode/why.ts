import type { Gate, Why } from "../../shared/types/mode.ts";
import { AUTO, AXES, GATES, OFF, STANDING_LINES } from "./constants.ts";
import { alternatives, metaOf, names, neverAuto, readContract, substitute, summary, truthy } from "./contracts.ts";
import { standingBlock } from "./frontmatter.ts";
import { resolveDir } from "./paths.ts";
import { originOf, pinFor } from "./pins.ts";
import { pipelineFor, position } from "./pipeline.ts";
import { outranking, ruleState } from "./rules.ts";
import { slotOf } from "./sessions.ts";
import { approvedSlug, guardsArmed, held, readState, redStanding, sessionKey, sourceOf, statePath } from "./state.ts";

const pad = (text: string, width: number): string => text.padEnd(width);

function slotLines(sid: string | undefined, folder: string): string[] {
  const out: string[] = [];
  for (const axis of AXES) {
    const name = held(axis, sid);
    if (!name) {
      out.push(`  ${pad(axis, 6)} ${pad(OFF, 11)} nothing is asked of this axis`);
      continue;
    }
    if (name === AUTO) {
      const offered = names(axis).filter(
        (n) => !neverAuto(metaOf(axis, n)) && alternatives(metaOf(axis, n), "enter-when").length,
      );
      out.push(`  ${pad(axis, 6)} ${pad(AUTO, 11)} empty, with ${offered.length} contracts on offer to the chooser`);
      continue;
    }
    const source = sourceOf(axis, sid) ?? "typed";
    out.push(`  ${pad(axis, 6)} ${pad(name, 11)} ${source}, ${summary(axis, name) || "no summary on file"}`);
    if (source !== "pinned") continue;
    out.push(`  ${pad("", 6)} ${pad("", 11)} from ${originOf(pinFor(axis, folder))}`);
    const takers = names(axis).filter(
      (n) => truthy(metaOf(axis, n), "enter-over-pin") && alternatives(metaOf(axis, n), "enter-when").length,
    );
    if (takers.length)
      out.push(
        `  ${pad("", 6)} ${pad("", 11)} ${takers.join(", ")} can still take it from a prompt's opening sentence`,
      );
  }
  return out;
}

export function gatesFor(sid?: string): Gate[] {
  const name = held("mode", sid);
  const meta = name && name !== AUTO ? metaOf("mode", name) : {};
  const armed = guardsArmed();
  const open = (key: string, reason: string): Gate => ({ name: key, state: "open", reason });
  const shut = (key: string, reason: string): Gate => ({ name: key, state: "shut", reason });
  return Object.keys(GATES)
    .sort()
    .map((key) => {
      const { what, switchable } = GATES[key] ?? { what: "", switchable: false };
      if (!truthy(meta, key)) return open(key, `not declared by ${name || "an empty mode slot"}`);
      if (switchable && !armed) return open(key, "declared but disarmed by guards: off in config.json");
      if (key === "no-dispatch-without-approval") {
        const slug = approvedSlug(sid);
        return slug
          ? open(key, `${slug} is approved`)
          : shut(key, `nothing is approved under ${name}, so ${what} is refused`);
      }
      return redStanding(sid) ? open(key, "a red is standing") : shut(key, `no red is standing, so ${what} is refused`);
    });
}

function gateLines(sid?: string): string[] {
  return gatesFor(sid).map(
    ({ name, state, reason }) => `  ${pad(name, 30)} ${state === "shut" ? "SHUT" : "open"}, ${reason}`,
  );
}

function nextLines(sid?: string): string[] {
  const out: string[] = [];
  for (const axis of AXES) {
    const name = held(axis, sid);
    if (!name || name === AUTO) continue;
    const marker = statePath(sid, `.${axis}.announced`);
    if (marker && readState(marker) === name) {
      const block = standingBlock(readContract(axis, name).body);
      const count = block ? block.split("\n").length : 0;
      out.push(`  ${pad(axis, 6)} the standing reminder of ${name}, ${Math.min(count, STANDING_LINES)} lines`);
    } else {
      out.push(`  ${pad(axis, 6)} the whole ${name} contract, once, and its reminder after that`);
    }
  }
  return out.length ? out : ["  nothing, because neither slot holds a contract"];
}

export function why(sid?: string, path?: string): Why {
  return {
    session: sessionKey(sid),
    path: resolveDir(path),
    slots: { mode: slotOf("mode", sid), style: slotOf("style", sid) },
    pipeline: pipelineFor(sid),
    gates: gatesFor(sid),
    rules: ruleState(sid),
  };
}

// Everything steering this turn on one page, since every other surface is a chip or text nobody sees.
export function whyReport({ session, path }: { session?: string; path?: string }): string {
  const out = ["What is steering this conversation", "", "Slots", ...slotLines(session, resolveDir(path))];
  const place = position("mode", session);
  if (place) out.push("", "Pipeline", ...place.split("\n").map((line) => `  ${line}`));
  out.push("", "Gates", ...gateLines(session));
  const { told, waiting } = ruleState(session);
  out.push("", "Ground rules", `  told     ${told.join(", ") || "none yet"}`);
  for (const { name, until } of waiting)
    out.push(`  waiting  ${name}` + (until ? `, until a prompt matches ${until}` : ""));
  for (const { stem } of outranking()) out.push(`  outranks ${stem}, restated every turn over the mode and the style`);
  out.push("", "The next prompt carries", ...nextLines(session));
  return substitute(out.join("\n"));
}
