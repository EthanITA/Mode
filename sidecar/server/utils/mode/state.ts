import { join } from "node:path"
import { type Axis, FALSEY, GREEN, RED } from "./constants.ts"
import { readTextSafe, splitLines } from "./fsutil.ts"
import { modeHome, stateHome } from "./paths.ts"

export function sessionKey(sid?: string): string {
  return (sid || process.env.CLAUDE_CODE_SESSION_ID || "").slice(0, 8)
}

export function statePath(sid: string | undefined, suffix: string): string | undefined {
  const key = sessionKey(sid)
  return key ? join(stateHome(), `session-${key}${suffix}`) : undefined
}

export function readState(path: string | undefined): string {
  const text = readTextSafe(path)
  if (!text) return ""
  for (const line of splitLines(text)) if (line.trim()) return line.trim()
  return ""
}

export function held(axis: Axis, sid?: string): string {
  return readState(statePath(sid, `.${axis}`))
}

function markedAs(axis: Axis, sid: string | undefined, kind: "chosen" | "pinned"): boolean {
  const name = held(axis, sid)
  return Boolean(name) && readState(statePath(sid, `.${axis}.${kind}`)) === name
}

export function sourceOf(axis: Axis, sid?: string): "chosen" | "pinned" | undefined {
  if (markedAs(axis, sid, "chosen")) return "chosen"
  if (markedAs(axis, sid, "pinned")) return "pinned"
  return undefined
}

function under(name: string, line: string): string {
  const tab = line.indexOf("\t")
  if (tab < 0) return ""
  return line.slice(tab + 1).trim() === name ? line.slice(0, tab).trim() : ""
}

export function approvedSlug(sid?: string, anyMode = false): string {
  const text = readTextSafe(statePath(sid, ".approved"))
  if (!text) return ""
  const name = held("mode", sid)
  for (const line of splitLines(text)) {
    if (!line.trim()) continue
    if (anyMode) {
      const tab = line.indexOf("\t")
      return (tab < 0 ? line : line.slice(0, tab)).trim()
    }
    return under(name, line)
  }
  return ""
}

export function ledger(axis: Axis, sid?: string): string[] {
  const text = readTextSafe(statePath(sid, `.${axis}.done`))
  if (!text) return []
  const name = held(axis, sid)
  const out: string[] = []
  for (const line of splitLines(text)) {
    if (!line.trim()) continue
    const value = under(name, line)
    if (value) out.push(value.toLowerCase())
  }
  return out
}

export function declared(axis: Axis, sid?: string): Set<string> {
  return new Set(ledger(axis, sid))
}

export function redStanding(sid?: string): boolean {
  const entries = ledger("mode", sid)
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i] === RED || entries[i] === GREEN) return entries[i] === RED
  }
  return false
}

export function guardsArmed(): boolean {
  const text = readTextSafe(join(modeHome(), "config.json"))
  if (!text) return true
  try {
    const data = JSON.parse(text) as { guards?: unknown }
    const raw = "guards" in data ? String(data.guards) : ""
    const value = raw.trim().replace(/^["']+|["']+$/g, "").toLowerCase()
    return !value || !FALSEY.has(value)
  } catch {
    return true
  }
}
