import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { readTextSafe } from "../files.ts";
import { lines, strip } from "../text.ts";
import { configRoot } from "./paths.ts";

const PREFIX = "session-";

const home = (): string => join(configRoot(), "artifacts");

const fileOf = (sid = process.env.CLAUDE_CODE_SESSION_ID || ""): string =>
  sid ? join(home(), `${PREFIX}${sid.slice(0, 8)}`) : "";

const keyOf = (name: string): string => (name.startsWith(PREFIX) ? name.slice(PREFIX.length) : "");

const entries = (sid?: string): string[] => {
  const seen = new Set<string>();
  for (const line of lines(readTextSafe(fileOf(sid)) ?? "")) if (strip(line)) seen.add(strip(line));
  return [...seen];
};

const record = (entry: string, sid?: string): void => {
  const file = fileOf(sid);
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  if (!entries(sid).includes(entry)) appendFileSync(file, `${entry}\n`);
};

export const ArtifactLists = { entries, home, keyOf, record };
