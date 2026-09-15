import { createHash } from "node:crypto"
import { existsSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { readTextSafe, splitLines } from "../mode/fsutil.ts"
import { artifactListsHome, isKey } from "./paths.ts"

function isDocument(entry: string): boolean {
  return entry.startsWith("/") && entry.endsWith(".md")
}

// The hash keeps two README.md apart. Mirrors document_slug in bin/artifact.
function documentSlug(path: string): string {
  const stem = basename(path).replace(/\.md$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
  return `${stem}--${createHash("sha1").update(path).digest("hex").slice(0, 6)}`
}

// Appended to on each stamp, so newest first is the file read backwards.
function entriesOf(key: string): string[] {
  const raw = readTextSafe(join(artifactListsHome(), `session-${key}`))
  if (!raw) return []
  const seen = new Set<string>()
  for (const line of splitLines(raw).reverse()) {
    const entry = line.trim()
    if (entry) seen.add(entry)
  }
  return [...seen]
}

export function artifactsOf(key: string): string[] {
  return entriesOf(key).flatMap((entry) => {
    if (!isDocument(entry)) return [entry]
    return existsSync(entry) ? [documentSlug(entry)] : []
  })
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

export const Documents = {
  slug: documentSlug,

  // Only a path some conversation recorded is served, so the sidecar never reads an arbitrary .md by name.
  paths(): Map<string, string> {
    const out = new Map<string, string>()
    for (const key of keysWithArtifacts()) {
      for (const entry of entriesOf(key)) {
        if (isDocument(entry) && existsSync(entry)) out.set(documentSlug(entry), entry)
      }
    }
    return out
  },
}
