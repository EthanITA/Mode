import { appendFileSync, mkdirSync, readdirSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import type { Axis } from "../../shared/types/mode.ts"
import { isFile } from "../files.ts"
import { strip } from "../text.ts"
import { AUTO, AXES, CHIP_ICON, COLORS, MARK, OFF, RED, RESET, STANDING_LINES } from "./constants.ts"
import { alternatives, available, hits, metaOf, names, neverAuto, readContract, substitute, truthy } from "./contracts.ts"
import { delivers } from "./deliverable.ts"
import { standingBlock } from "./frontmatter.ts"
import { resolveDir, stateHome } from "./paths.ts"
import { pinFor } from "./pins.ts"
import { Refusal } from "./refusal.ts"
import {
  approvedSlug,
  declared,
  deliverable,
  dropSlot,
  held,
  readState,
  redStanding,
  removeState,
  require,
  saveDeliverable,
  settled,
  sourceOf,
  stamp,
  statePath,
  writeState,
} from "./state.ts"

type SlotArgs = { axis: Axis; session?: string }

function hold(axis: Axis, sid: string | undefined, name: string, chosen = false): void {
  writeState(require(settled(axis, sid)), name)
  writeState(require(statePath(sid, `.${axis}`)), name)
  // Typing the name is the normal case, so an unflagged set is what leaves the slot unmarked.
  for (const kind of ["chosen", "pinned"]) removeState(statePath(sid, `.${axis}.${kind}`))
  if (chosen) writeState(require(statePath(sid, `.${axis}.chosen`)), name)
}

// A mode's own style, put in place unless this conversation typed a style or typed it off.
function ownStyle(sid: string | undefined, mode: string): void {
  const style = strip(String(metaOf("mode", mode).style || ""))
  const current = held("style", sid)
  const typed = (current !== "" && current !== AUTO && !sourceOf("style", sid)) || readState(settled("style", sid)) === OFF
  if (names("style").includes(style) && !typed) hold("style", sid, style, true)
}

export function setSlot({ axis, session, name, chosen = false }: SlotArgs & { name: string; chosen?: boolean }): string {
  require(statePath(session, `.${axis}`))
  // auto is a slot value, not a contract, so it has no file to validate against.
  if (name !== AUTO && name !== OFF && !names(axis).includes(name)) throw new Refusal(`no ${axis} named '${name}'. ${available(axis)}`, 2)
  // Recorded after the name is judged, so a typo is never a decision, and before off returns, so emptying a slot is one.
  writeState(require(settled(axis, session)), name)
  if (name === OFF) {
    dropSlot(axis, session)
    return `${axis} set to off`
  }
  hold(axis, session, name, chosen)
  if (axis === "mode") {
    // A new mode keeps only the parts of the north star it can still deliver.
    const state = deliverable(session)
    const offered = delivers(session)
    saveDeliverable(session, { ...state, intents: (state.intents ?? []).filter((intent) => offered.includes(intent)) })
    ownStyle(session, name)
  }
  return `${axis} set to ${name}`
}

export function getSlot({ axis, session, chip = false }: SlotArgs & { chip?: boolean }): string {
  const name = held(axis, session)
  if (!chip) return name
  // Always three fields: a caller splitting on tabs cannot tell a missing one from an empty one.
  const color = name ? (COLORS[metaOf(axis, name).color ?? ""] ?? "") : ""
  return `${name}\t${color}\t${sourceOf(axis, session) ?? ""}`
}

export function chips(session?: string): string {
  const parts = AXES.map((axis) => {
    const name = held(axis, session)
    // An empty slot renders as off rather than vanishing, so the line always has both entries.
    if (!name) return `${CHIP_ICON[axis]} ${OFF}`
    const label = (MARK[sourceOf(axis, session) ?? ""] ?? "") + name
    const color = COLORS[metaOf(axis, name).color ?? ""] ?? ""
    return `${CHIP_ICON[axis]} ${color ? `\x1b[${color}m${label}${RESET}` : label}`
  })
  if (delivers(session).length) {
    const state = deliverable(session)
    const named = (state.intents ?? []).join("+")
    // The same mark as a chosen slot: something read it off the ask rather than somebody naming it.
    parts.push(`${CHIP_ICON.deliverable} ` + (named ? (state.source === "jev" ? MARK.chosen : "") + named : "none"))
  }
  return parts.join("  ")
}

// The contract a message asks for, while that slot is on auto or still holds only a pin.
export function choose({ axis, session, message }: SlotArgs & { message: string }): string {
  const pinned = sourceOf(axis, session) === "pinned"
  // A value set by hand is a decision the user made, and no message overrides it.
  if (held(axis, session) !== AUTO && !pinned) return ""
  // A pin is a default, so only a role named up front takes it, never a mention further in.
  const text = pinned ? (message.toLowerCase().split(/[.\n]/, 1)[0] ?? "") : message.toLowerCase()
  const found = names(axis).filter((name) => {
    const meta = metaOf(axis, name)
    if (neverAuto(meta) || (pinned && !truthy(meta, "enter-over-pin"))) return false
    return hits(text, alternatives(meta, "enter-when"))
  })
  // Two readings of one message is a wrong reading, so choosing nothing beats guessing between them.
  return found.length === 1 ? (found[0] ?? "") : ""
}

export function standing(session?: string): string {
  const out = AXES.flatMap((axis) => {
    const block = standingBlock(readContract(axis, held(axis, session)).body)
    return block ? block.split("\n").slice(0, STANDING_LINES) : []
  })
  return out.length ? substitute(out.join("\n")) : ""
}

// So a caller can route a bare name without keeping its own copy of which contracts exist.
export function axisOf(name: string): Axis | undefined {
  return AXES.find((axis) => names(axis).includes(name))
}

// Records the artifact the user approved, under the mode they approved it in; with no slug, reads it back.
export function approve({ slug, anyMode = false, session }: { slug?: string; anyMode?: boolean; session?: string }): string | undefined {
  if (slug) {
    writeState(require(statePath(session, ".approved")), stamp(held("mode", session), slug))
    return slug
  }
  return approvedSlug(session, anyMode) || undefined
}

export function done({ axis, session, reason }: SlotArgs & { reason: string }): string {
  const path = require(statePath(session, `.${axis}.done`))
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, stamp(held(axis, session), reason) + "\n")
  return `recorded ${reason}`
}

// Observed reasons read state that already exists; every other reason waits for `done`.
const OBSERVED: Record<string, (sid?: string) => boolean> = { approved: (sid) => !!approvedSlug(sid) }
// A hook injects this into a sentence a person reads, so the token itself would be machine talk.
const PHRASES: Record<string, (sid?: string) => string> = {
  approved: (sid) => `the user approved ${approvedSlug(sid) || "the spec"}`,
  "mr-opened": () => "the merge request is open",
}

export function expired({ axis, session }: SlotArgs): string | undefined {
  const name = held(axis, session)
  if (!name || name === AUTO) return undefined
  const recorded = declared(axis, session)
  for (const reason of alternatives(metaOf(axis, name), "exit-when")) {
    // manual is the contract saying only the user ends it, so nothing recorded can satisfy it.
    if (reason === "manual") continue
    if (OBSERVED[reason]?.(session) || recorded.has(reason)) return PHRASES[reason]?.(session) ?? reason
  }
  return undefined
}

// A chosen slot returns to auto, because a slot that emptied itself would only ever choose once.
export function exitSlot({ axis, session }: SlotArgs): string | undefined {
  const name = held(axis, session)
  if (!name || name === AUTO) return undefined
  const back = sourceOf(axis, session) === "chosen" ? AUTO : OFF
  dropSlot(axis, session)
  if (back === AUTO) writeState(require(statePath(session, `.${axis}`)), AUTO)
  return `${axis} set to ${back}`
}

// An axis anyone already spoke for is never adopted into, so a pin stays a default a typed name beats.
export function adopt({ path, session }: { path?: string; session?: string }): string | undefined {
  const folder = resolveDir(path)
  const filled: string[] = []
  for (const axis of AXES) {
    const mark = settled(axis, session)
    if (!mark || isFile(mark) || held(axis, session)) continue
    const { name, layer } = pinFor(axis, folder)
    if (!name) continue
    writeState(require(statePath(session, `.${axis}`)), name)
    writeState(require(statePath(session, `.${axis}.pinned`)), name)
    writeState(mark, name)
    filled.push(`${axis} adopted ${name} from a ${layer} pin`)
  }
  return filled.length ? filled.join("\n") : undefined
}

export function red(session?: string): string | undefined {
  return redStanding(session) ? RED : undefined
}

export function clear({ session, announced = false }: { session?: string; announced?: boolean }): void {
  if (announced) {
    for (const axis of AXES) removeState(statePath(session, `.${axis}.announced`))
    // A resume or a compact drops the injected ground rules exactly as it drops a contract.
    const rules = statePath(session, ".rules")
    if (!rules) return
    removeState(rules)
    const scoped = basename(rules).replace(".rules", ".rule-")
    try {
      for (const file of readdirSync(stateHome())) if (file.startsWith(scoped)) removeState(join(stateHome(), file))
    } catch {}
    return
  }
  for (const axis of AXES) {
    dropSlot(axis, session)
    // The settled mark goes too, so a cleared conversation is one a pin may fill again.
    removeState(settled(axis, session))
  }
}
