import { join } from "node:path"
import { AUTO, type Axis, AXES, OFF, SHARED_PIN_FILE } from "./constants.ts"
import { names } from "./contracts.ts"
import { unquote } from "./frontmatter.ts"
import { readTextSafe, splitLines } from "./fsutil.ts"
import { ancestors, pinsFile, resolveDir } from "./paths.ts"

function readPins(): [path: string, axis: string, value: string][] {
  const text = readTextSafe(pinsFile())
  if (!text) return []
  const rows: [string, string, string][] = []
  for (const line of splitLines(text)) {
    const parts = line.split("\t")
    const [path, axis, value] = parts
    // parts.length === 3 guarantees all three at runtime; the ?? satisfies the indexer, not a real fallback.
    if (parts.length === 3 && path?.trim()) rows.push([path, axis ?? "", (value ?? "").trim()])
  }
  return rows
}

function sharedPin(folder: string, axis: Axis): string {
  const text = readTextSafe(join(folder, SHARED_PIN_FILE))
  if (!text) return ""
  for (const line of splitLines(text)) {
    const sep = line.indexOf(":")
    if (sep < 0 || line.slice(0, sep).trim().toLowerCase() !== axis) continue
    return unquote(line.slice(sep + 1).split("#")[0] ?? "").trim()
  }
  return ""
}

type PinHit = { name: string; layer?: "personal" | "shared" | typeof OFF; folder?: string }

// Personal beats shared in the same folder; a name no contract answers to is stepped over, never held.
function pinFor(axis: Axis, start: string): PinHit {
  const mine = new Map(readPins().filter(([, a]) => a === axis).map(([path, , value]) => [path, value]))
  for (const folder of ancestors(start)) {
    const candidates: [string, "personal" | "shared"][] = [
      [mine.get(folder) || "", "personal"],
      [sharedPin(folder, axis), "shared"],
    ]
    for (const [name, layer] of candidates) {
      if (!name) continue
      if (name === OFF) return { name: "", layer: OFF, folder }
      if (name !== AUTO && !names(axis).includes(name)) continue
      return { name, layer, folder }
    }
  }
  return { name: "" }
}

export type PinSlot = { name?: string; layer?: "personal" | "shared" | typeof OFF; file?: string }
export type Pins = { path: string; mode: PinSlot; style: PinSlot }

export function pins(path?: string): Pins {
  const folder = resolveDir(path)
  const result = { path: folder } as Pins
  for (const axis of AXES) {
    const hit = pinFor(axis, folder)
    if (hit.layer === OFF) {
      result[axis] = { layer: OFF, file: hit.folder }
    } else if (hit.name) {
      const file = hit.layer === "personal" ? pinsFile() : hit.folder ? join(hit.folder, SHARED_PIN_FILE) : undefined
      result[axis] = { name: hit.name, layer: hit.layer, file }
    } else {
      result[axis] = {}
    }
  }
  return result
}
