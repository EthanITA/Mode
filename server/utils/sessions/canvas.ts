import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { CanvasPlacement } from "~~/shared/types/canvas"
import { readTextSafe } from "../mode/fsutil.ts"
import { canvasHome } from "./paths.ts"

export function canvasOf(key: string): CanvasPlacement | undefined {
  const raw = readTextSafe(join(canvasHome(), `session-${key}`))
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed as CanvasPlacement : undefined
  } catch {
    return undefined
  }
}

export function writeCanvas(key: string, placement: CanvasPlacement): CanvasPlacement {
  const home = canvasHome()
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, `session-${key}`), JSON.stringify(placement))
  return placement
}
