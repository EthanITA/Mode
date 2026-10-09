import { join } from "node:path"
import type { Axis } from "../../shared/types/mode.ts"
import { readTextSafe } from "../files.ts"
import { AUTO, AXES, FOLDER } from "./constants.ts"
import { available, names, readContract, summary } from "./contracts.ts"
import type { Meta } from "./frontmatter.ts"
import { pluginRoot } from "./paths.ts"
import { Refusal } from "./refusal.ts"
import { held } from "./state.ts"

const rstrip = (text: string): string => text.replace(/\s+$/, "")

export function list({ axis, tsv = false, session }: { axis?: Axis; tsv?: boolean; session?: string }): string {
  const axes = axis ? [axis] : [...AXES]
  if (tsv) {
    return axes
      .flatMap((one) => names(one).map((name) => `${one}\t${name}\t${summary(one, name)}\t${name === held(one, session) ? "active" : ""}`))
      .join("\n")
  }
  const sections = axes.flatMap((one) => {
    const found = names(one)
    if (!found.length) return []
    const current = held(one, session)
    const width = Math.max(...found.map((name) => name.length))
    return [[FOLDER[one], ...found.map((name) => rstrip(`${name === current ? "*" : " "} ${name.padEnd(width)}  ${summary(one, name)}`))].join("\n")]
  })
  return sections.join("\n\n")
}

const metaText = (meta: Meta): string =>
  Object.entries(meta)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")

// A positional that is not an axis names a contract, so `show debug --meta` reads one by name, which is how a gate inspects it.
export function show({ target, meta = false, session }: { target?: string; meta?: boolean; session?: string }): string {
  if (target && !AXES.includes(target as Axis)) {
    const axis = AXES.find((one) => names(one).includes(target))
    if (!axis) throw new Refusal(`nothing named '${target}'. ${available("mode")}`, 2)
    const contract = readContract(axis, target)
    const text = meta ? metaText(contract.meta) : contract.body
    if (!text) throw new Refusal(`no contract file for '${target}' could be read`, 1)
    return text
  }
  const axes = target ? [target as Axis] : [...AXES]
  const blocks: string[] = []
  const unreadable: string[] = []
  for (const axis of axes) {
    const name = held(axis, session)
    if (!name || name === AUTO) continue
    const contract = readContract(axis, name)
    const text = meta ? metaText(contract.meta) : contract.body
    if (!text) {
      unreadable.push(`${axis} holds '${name}' but no contract file for it could be read`)
      continue
    }
    // Labelled only when the caller named no axis, since two unlabelled bodies read as one.
    blocks.push(target ? text : `${axis}: ${name}\n\n${text}`)
  }
  if (!blocks.length) throw new Refusal(unreadable.length ? unreadable.join("\n") : `nothing held for ${axes.join(" or ")}`, 1)
  return blocks.join("\n\n")
}

// Reads the copy that is actually running, which is the only way to tell an update landed.
export function version(): string {
  const path = join(pluginRoot(), ".claude-plugin", "plugin.json")
  let data: unknown
  try {
    data = JSON.parse(readTextSafe(path) ?? "")
  } catch {
    throw new Refusal(`No readable manifest at ${path}, so this copy cannot say what version it is.`)
  }
  const found = typeof data === "object" && data ? (data as { version?: unknown }).version : undefined
  if (!found) {
    throw new Refusal(
      `${path} carries no version, so an install of it would land in a directory named 'unknown' and every later update would overwrite it.`,
    )
  }
  return String(found)
}
