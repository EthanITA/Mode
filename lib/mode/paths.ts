import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Axis } from "../../shared/types/mode.ts";
import { FOLDER, PINS_FILE } from "./constants.ts";

const moduleDir = dirname(fileURLToPath(import.meta.url));

// Walked up rather than a fixed hop count, which breaks once Nitro bundles this file into .output.
export function resolvePluginRoot(start: string, guess: string): string {
  const found = ancestors(start).find((dir) => existsSync(join(dir, ".claude-plugin", "plugin.json")));
  if (found) return found;
  if (existsSync(join(guess, "skills", "mode"))) return guess;
  throw new Error(
    `mode plugin root not found: no .claude-plugin/plugin.json above any of ${ancestors(start).join(", ")}, ` +
      `and no skills/mode under the fallback guess ${guess}. Set MODE_PLUGIN_ROOT to the plugin's root.`,
  );
}

export function pluginRoot(): string {
  const override = process.env.MODE_PLUGIN_ROOT;
  if (override) return override;
  // The platform sets this per hook, so it is only ours when it carries our skill.
  const plugin = process.env.CLAUDE_PLUGIN_ROOT;
  if (plugin && existsSync(join(plugin, "skills", "mode"))) return plugin;
  return resolvePluginRoot(moduleDir, resolve(moduleDir, "..", ".."));
}

export function configRoot(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function modeHome(): string {
  return join(configRoot(), "mode");
}

export function sidecarHome(): string {
  return join(configRoot(), "sidecar");
}

// Session state sits one level down, so it can never be mistaken for a contract folder.
export function stateHome(): string {
  return join(modeHome(), "state");
}

// Shipped first, the user's own second, so a plugin update can never delete somebody's contract.
export function contractDirs(axis: Axis): string[] {
  return [join(pluginRoot(), "skills", "mode", FOLDER[axis]), join(modeHome(), FOLDER[axis])];
}

export function rulesDirs(): string[] {
  return [join(pluginRoot(), "skills", "mode", "rules"), join(modeHome(), "rules")];
}

export function pinsFile(): string {
  return join(modeHome(), PINS_FILE);
}

export function ancestors(start: string): string[] {
  const out = [start];
  for (let dir = start; dirname(dir) !== dir; dir = dirname(dir)) out.push(dirname(dir));
  return out;
}

// A directory pins are resolved from still has to answer once it stops existing, so only the part that exists is resolved.
export function resolveDir(path?: string): string {
  const absolute = resolve(path || process.cwd());
  const rest: string[] = [];
  for (let head = absolute; ; head = dirname(head)) {
    try {
      return join(realpathSync.native(head), ...rest);
    } catch {
      if (dirname(head) === head) return absolute;
      rest.unshift(basename(head));
    }
  }
}
