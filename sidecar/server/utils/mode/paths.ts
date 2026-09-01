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

export function pluginRoot(): string {
  const override = process.env.MODE_PLUGIN_ROOT
  if (override) return override
  const plugin = process.env.CLAUDE_PLUGIN_ROOT
  if (plugin && existsSync(join(plugin, "skills", "mode"))) return plugin
  return findPluginRoot(moduleDir) || join(homedir(), ".claude", "skills", "mode")
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
