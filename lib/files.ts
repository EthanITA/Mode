import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export function isFile(path?: string): boolean {
  if (!path) return false
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function isDir(path?: string): boolean {
  if (!path) return false
  try {
    return statSync(path).isDirectory()
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

// Lenient UTF-8, so one bad byte reads as a replacement character rather than an unreadable file.
export function readTextSafe(path?: string): string | undefined {
  if (!path) return undefined
  try {
    return readFileSync(path, "utf8").replace(/\r\n?/g, "\n")
  } catch {
    return undefined
  }
}

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}
