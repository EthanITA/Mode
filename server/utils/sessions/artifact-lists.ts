import { readdirSync } from "node:fs"
import { join } from "node:path"
import { readTextSafe, splitLines } from "../mode/fsutil.ts"
import { artifactListsHome, isKey } from "./paths.ts"

// Appended to on each stamp, so newest first is the file read backwards.
export function artifactsOf(key: string): string[] {
  const raw = readTextSafe(join(artifactListsHome(), `session-${key}`))
  if (!raw) return []
  const seen = new Set<string>()
  for (const line of splitLines(raw).reverse()) {
    const slug = line.trim()
    if (slug) seen.add(slug)
  }
  return [...seen]
}

export function keysWithArtifacts(): string[] {
  let names: string[]
  try {
    names = readdirSync(artifactListsHome())
  } catch {
    return []
  }
  return names.map((name) => name.replace(/^session-/, "")).filter(isKey)
}
