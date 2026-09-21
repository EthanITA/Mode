import { readFileSync, readdirSync, statSync } from "node:fs"

export function isFile(path: string | undefined): boolean {
  if (!path) return false
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function listMd(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(".md"))
  } catch {
    return []
  }
}

export function readTextSafe(path: string | undefined): string | undefined {
  if (!path) return undefined
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}
