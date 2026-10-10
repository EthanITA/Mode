import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { modeConfig } from "../mode/config.ts";
import { resolvePluginRoot, sidecarHome } from "../mode/paths.ts";
import { pyStr } from "../text.ts";

const moduleDir = dirname(fileURLToPath(import.meta.url));

// Not CLAUDE_PLUGIN_ROOT: a hook sets that for whichever copy is installed, and bin/artifact serves the copy it runs from.
export function root(): string {
  return process.env.MODE_PLUGIN_ROOT || resolvePluginRoot(moduleDir, resolve(moduleDir, "..", ".."));
}

// Universal newlines, the way python's read_text hands a page over, so a rewrite never keeps a stray \r.
export function readPage(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}

export const expandHome = (path: string): string =>
  path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path;

export function artifactsDir(): string {
  const configured = process.env.NOTES_ARTIFACTS || (modeConfig().artifacts ? pyStr(modeConfig().artifacts) : "");
  return configured ? expandHome(configured) : join(sidecarHome(), "artifacts");
}
