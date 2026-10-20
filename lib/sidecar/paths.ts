import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const configRoot = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

export const plansHome = (): string => join(configRoot(), "plans");

export const expandHome = (path: string): string =>
  path === "~" || path.startsWith("~/") ? homedir() + path.slice(1) : path;

const resolveRoot = (start: string): string => {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "nuxt.config.ts"))) return dir;
    if (dirname(dir) === dir)
      throw new Error(`sidecar root not found above ${start}. Set SIDECAR_ROOT to the checkout.`);
  }
};

export const Sidecar = {
  artifacts: (): string =>
    process.env.NOTES_ARTIFACTS ? expandHome(process.env.NOTES_ARTIFACTS) : join(configRoot(), "sidecar", "artifacts"),
  home: (): string => join(configRoot(), "sidecar"),
  resolveRoot,
  root: (): string => process.env.SIDECAR_ROOT || resolveRoot(dirname(fileURLToPath(import.meta.url))),
};
