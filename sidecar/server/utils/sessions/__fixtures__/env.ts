import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const MODE_PLUGIN = join(HERE, "..", "..", "mode", "__fixtures__", "plugin")

function restore(key: string, had: boolean, was: string | undefined): void {
  if (had) process.env[key] = was ?? ""
  else delete process.env[key]
}

export function useFixtures(): () => void {
  // `in` rather than a truth test: an env var set to "" must restore as "", not as unset.
  const hadConfig = "CLAUDE_CONFIG_DIR" in process.env
  const hadPlugin = "MODE_PLUGIN_ROOT" in process.env
  const prevConfig = process.env.CLAUDE_CONFIG_DIR
  const prevPlugin = process.env.MODE_PLUGIN_ROOT
  process.env.CLAUDE_CONFIG_DIR = join(HERE, "config")
  process.env.MODE_PLUGIN_ROOT = MODE_PLUGIN
  return () => {
    restore("CLAUDE_CONFIG_DIR", hadConfig, prevConfig)
    restore("MODE_PLUGIN_ROOT", hadPlugin, prevPlugin)
  }
}

export const FIXTURES_DIR = HERE
export const ALPHA_ID = "aaaaaaaa-1111-2222-3333-444444444444"
export const BETA_ID = "bbbbbbbb-2222-3333-4444-555555555555"
