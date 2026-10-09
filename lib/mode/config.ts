import { join } from "node:path"
import { readTextSafe } from "../files.ts"
import { modeHome } from "./paths.ts"

export type ModeConfig = { [key: string]: unknown }

export function modeConfig(): ModeConfig {
  try {
    const found: unknown = JSON.parse(readTextSafe(join(modeHome(), "config.json")) ?? "")
    return typeof found === "object" && found && !Array.isArray(found) ? (found as ModeConfig) : {}
  } catch {
    return {}
  }
}
