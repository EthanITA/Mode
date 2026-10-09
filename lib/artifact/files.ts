import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { resolvePluginRoot } from "../mode/paths.ts"

const moduleDir = dirname(fileURLToPath(import.meta.url))

// Not CLAUDE_PLUGIN_ROOT: a hook sets that for whichever copy is installed, and bin/artifact serves the copy it runs from.
export function root(): string {
  return process.env.MODE_PLUGIN_ROOT || resolvePluginRoot(moduleDir, resolve(moduleDir, "..", ".."))
}

// Universal newlines, the way python's read_text hands a page over, so a rewrite never keeps a stray \r.
export function readPage(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n?/g, "\n")
}
