import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readTextSafe } from "../files.ts";
import { Sidecar } from "./paths.ts";

export interface Settings {
  surface?: "desktop" | "web";
  user?: string;
}

const file = (): string => join(Sidecar.home(), "config.json");

const read = (): Settings => {
  try {
    const parsed: unknown = JSON.parse(readTextSafe(file()) ?? "{}");
    return typeof parsed === "object" && !!parsed && !Array.isArray(parsed) ? (parsed as Settings) : {};
  } catch {
    return {};
  }
};

const write = (patch: Settings): void => {
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), `${JSON.stringify({ ...read(), ...patch }, null, 2)}\n`);
};

export const SidecarConfig = { file, read, write };
