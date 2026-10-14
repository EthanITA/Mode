import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { readTextSafe } from "../files.ts";
import { sidecarHome } from "../mode/paths.ts";
import { documentSlug } from "./comments.ts";

const FORMATS = [".html", ".md"];

const listPath = (): string => join(sidecarHome(), "tracked.json");

function read(): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(readTextSafe(listPath()) ?? "{}");
    if (typeof raw !== "object" || !raw) return {};
    return Object.fromEntries(
      Object.entries(raw).filter((pair): pair is [string, string] => typeof pair[1] === "string"),
    );
  } catch {
    return {};
  }
}

function write(all: Record<string, string>): void {
  mkdirSync(dirname(listPath()), { recursive: true });
  const tmp = `${listPath()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(all, undefined, 2)}\n`);
  renameSync(tmp, listPath());
}

// A local file a link opened, kept by its document slug so the sidecar serves only paths someone chose to open.
export const Tracked = {
  isTrackable: (path: string): boolean => FORMATS.includes(extname(path).toLowerCase()),

  paths(): Map<string, string> {
    return new Map(Object.entries(read()));
  },

  track(path: string): string {
    const slug = documentSlug(path);
    const all = read();
    if (all[slug] !== path) write({ ...all, [slug]: path });
    return slug;
  },

  untrack(slug: string): string | undefined {
    const { [slug]: path, ...rest } = read();
    if (path) write(rest);
    return path;
  },
};
