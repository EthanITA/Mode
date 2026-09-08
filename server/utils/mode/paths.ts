import { existsSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { type Axis, FOLDER, PINS_FILE } from "./constants.ts"

const moduleDir = dirname(fileURLToPath(import.meta.url))

// A fixed hop count breaks once Nitro bundles this file into .output/server/chunks.
function findPluginRoot(start: string): string | undefined {
  let dir = start
  while (true) {
    if (existsSync(join(dir, ".claude-plugin", "plugin.json"))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

// Split from pluginRoot() so a test can drive it with a fixture start/guess instead of this
// file's own real import.meta.url.
export function resolvePluginRoot(start: string, guess: string): string {
  const found = findPluginRoot(start)
  if (found) return found
  if (existsSync(join(guess, "skills", "mode"))) return guess
  // Refuse to guess quietly: a wrong guess here reads as valid-but-empty contracts, not a failure.
  throw new Error(
    `mode plugin root not found: no .claude-plugin/plugin.json above any of ${ancestors(start).join(", ")}, ` +
      `and no skills/mode under the fallback guess ${guess}. Set MODE_PLUGIN_ROOT to the plugin's root.`,
  )
}

export function pluginRoot(): string {
  const override = process.env.MODE_PLUGIN_ROOT
  if (override) return override
  const plugin = process.env.CLAUDE_PLUGIN_ROOT
  if (plugin && existsSync(join(plugin, "skills", "mode"))) return plugin
  return resolvePluginRoot(moduleDir, join(homedir(), ".claude", "skills", "mode"))
}

export function configRoot(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")
}

export function modeHome(): string {
  return join(configRoot(), "mode")
}

export function stateHome(): string {
  return join(modeHome(), "state")
}

// Shipped first, the user's own second, so a plugin update can never delete somebody's contract.
export function contractDirs(axis: Axis): string[] {
  return [join(pluginRoot(), "skills", "mode", FOLDER[axis]), join(modeHome(), FOLDER[axis])]
}

export function rulesDirs(): string[] {
  return [join(pluginRoot(), "skills", "mode", "rules"), join(modeHome(), "rules")]
}

export function pinsFile(): string {
  return join(modeHome(), PINS_FILE)
}

export function ancestors(start: string): string[] {
  const out = [start]
  let cur = start
  while (dirname(cur) !== cur) {
    cur = dirname(cur)
    out.push(cur)
  }
  return out
}

// A directory pins are resolved from still has to answer even once it stops existing on disk.
export function resolveDir(path?: string): string {
  const candidate = path || process.cwd()
  try {
    return realpathSync.native(candidate)
  } catch {
    try {
      return resolve(candidate)
    } catch {
      return homedir()
    }
  }
}
