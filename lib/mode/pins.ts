import { join } from "node:path"
import type { Axis } from "../../shared/types/mode.ts"
import { readTextSafe, writeText } from "../files.ts"
import { lines, strip } from "../text.ts"
import { AUTO, AXES, OFF, SHARED_PIN_FILE } from "./constants.ts"
import { available, names } from "./contracts.ts"
import { unquote } from "./frontmatter.ts"
import { ancestors, pinsFile, resolveDir } from "./paths.ts"
import { Refusal } from "./refusal.ts"

type Row = [folder: string, axis: string, name: string]
export type PinHit = { name: string; layer: "personal" | "shared" | typeof OFF | ""; folder?: string }

function readPins(): Row[] {
  const rows: Row[] = []
  for (const line of lines(readTextSafe(pinsFile()) ?? "")) {
    const parts = line.split("\t")
    if (parts.length === 3 && strip(parts[0] ?? "")) rows.push([parts[0] ?? "", parts[1] ?? "", strip(parts[2] ?? "")])
  }
  return rows
}

function savePins(rows: Row[]): void {
  const unique = [...new Map(rows.map((row) => [row.join("\t"), row])).values()]
  unique.sort((a, b) => (a.join("\0") < b.join("\0") ? -1 : a.join("\0") > b.join("\0") ? 1 : 0))
  writeText(pinsFile(), unique.map((row) => row.join("\t") + "\n").join(""))
}

function sharedPin(folder: string, axis: Axis): string {
  for (const line of lines(readTextSafe(join(folder, SHARED_PIN_FILE)) ?? "")) {
    const sep = line.indexOf(":")
    if (sep >= 0 && strip(line.slice(0, sep)).toLowerCase() === axis) return strip(unquote(line.slice(sep + 1).split("#")[0] ?? ""))
  }
  return ""
}

// Personal beats shared in the same folder; a name no contract here answers to is stepped over, never held.
export function pinFor(axis: Axis, start: string): PinHit {
  const mine = new Map(readPins().filter(([, a]) => a === axis).map(([folder, , name]) => [folder, name]))
  for (const folder of ancestors(start)) {
    const candidates: [string, "personal" | "shared"][] = [[mine.get(folder) ?? "", "personal"], [sharedPin(folder, axis), "shared"]]
    for (const [name, layer] of candidates) {
      if (!name) continue
      if (name === OFF) return { name: "", layer: OFF, folder }
      if (name !== AUTO && !names(axis).includes(name)) continue
      return { name, layer, folder }
    }
  }
  return { name: "", layer: "" }
}

export function originOf(hit: PinHit): string {
  return hit.layer === "personal" ? pinsFile() : hit.folder ? join(hit.folder, SHARED_PIN_FILE) : "?"
}

// Writes the personal layer. With no name it answers what this directory resolves to.
export function pin({ axis, name, forget, path }: { axis: Axis; name?: string; forget?: boolean; path?: string }): string | undefined {
  const folder = resolveDir(path)
  if (!name && !forget) return pinFor(axis, folder).name || undefined
  if (name && name !== OFF && name !== AUTO && !names(axis).includes(name)) {
    throw new Refusal(`no ${axis} named '${name}'. ${available(axis)}`, 2)
  }
  const rows = readPins().filter(([f, a]) => !(f === folder && a === axis))
  if (forget) {
    savePins(rows)
    return `${axis} pin forgotten for ${folder}`
  }
  // off is stored rather than deleted, since a personal no is the only way to mask a repo's own file.
  savePins([...rows, [folder, axis, name ?? ""]])
  return `${axis} pinned to ${name} for ${folder}`
}

export type PinSlot = { name?: string; layer?: "personal" | "shared" | typeof OFF; file?: string }
export type Pins = { path: string; mode: PinSlot; style: PinSlot }

export function pins(path?: string): Pins {
  const folder = resolveDir(path)
  const slot = (axis: Axis): PinSlot => {
    const hit = pinFor(axis, folder)
    if (hit.layer === OFF) return { layer: OFF, file: hit.folder }
    return hit.name && hit.layer ? { name: hit.name, layer: hit.layer, file: originOf(hit) } : {}
  }
  return { path: folder, mode: slot("mode"), style: slot("style") }
}

export function pinsReport(path?: string): string {
  const folder = resolveDir(path)
  const out = [`pins for ${folder}`]
  for (const axis of AXES) {
    const hit = pinFor(axis, folder)
    if (hit.layer === OFF) out.push(`  ${axis.padEnd(6)} ${OFF.padEnd(11)} pinned off at ${hit.folder}`)
    else if (hit.name) out.push(`  ${axis.padEnd(6)} ${hit.name.padEnd(11)} ${hit.layer}, from ${originOf(hit)}`)
    else out.push(`  ${axis.padEnd(6)} ${"-".padEnd(11)} nothing pinned at or above this directory`)
  }
  return out.join("\n")
}
