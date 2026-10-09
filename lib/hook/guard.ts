import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { isRecord, record, type Payload } from "./io.ts"

const OFF = new Set(["false", "no", "off", "n", "0"])

function modeConfig(): Payload {
  const home = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")
  try {
    return record(JSON.parse(readFileSync(join(home, "mode", "config.json"), "utf8")))
  } catch {
    return {}
  }
}

function listed(list: unknown, name: string): boolean {
  if (Array.isArray(list) || typeof list === "string") return list.includes(name)
  return isRecord(list) && name in list
}

// Guards are on unless the config says off, and `disarm` names a guard by the stem of the file running it.
export function armed(): boolean {
  const settings = modeConfig()
  const value = String(settings.guards ?? "").trim().replace(/^["']+|["']+$/g, "").toLowerCase()
  if (OFF.has(value)) return false
  return !listed(settings.disarm, basename(process.argv[1] ?? "", ".ts"))
}
