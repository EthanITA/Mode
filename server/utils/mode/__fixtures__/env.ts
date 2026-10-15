import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))

export function useFixtures(config: "config" | "config-disarmed" = "config"): () => void {
  const prevConfig = process.env.CLAUDE_CONFIG_DIR
  const prevPlugin = process.env.MODE_PLUGIN_ROOT
  process.env.CLAUDE_CONFIG_DIR = join(HERE, config)
  process.env.MODE_PLUGIN_ROOT = join(HERE, "plugin")
  // `!x` would conflate a var explicitly set to "" with one never set at all.
  return () => {
    if (prevConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = prevConfig
    if (prevPlugin === undefined) delete process.env.MODE_PLUGIN_ROOT
    else process.env.MODE_PLUGIN_ROOT = prevPlugin
  }
}

export const FIXTURES_DIR = HERE
