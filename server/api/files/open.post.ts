import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, resolve } from "node:path";
import { artifactsDir, expandHome } from "~~/lib/artifact/files";
import { record } from "~~/lib/artifact/store";
import { plansHome } from "~~/lib/sidecar/paths";
import { documentSlug } from "~~/lib/sidecar/comments";
import { Tracked } from "~~/lib/sidecar/tracked";
import { isKey } from "~~/server/utils/sessions/paths";
import type { FileOpenReply } from "~~/shared/types/files";

function fieldOf(raw: unknown, name: string): string {
  const value = typeof raw === "object" && raw ? (raw as Record<string, unknown>)[name] : "";
  return typeof value === "string" ? value.trim() : "";
}

// The opened path is real, so a folder reached through a symlink must be compared real too.
function isIn(path: string, folder: string): boolean {
  try {
    return dirname(path) === realpathSync(folder);
  } catch {
    return false;
  }
}

// A page or plan already has its entry, so only a file from anywhere else is tracked under a slug of its own.
function slugOf(path: string, session: string): string {
  if (isIn(path, artifactsDir())) {
    const slug = basename(path, extname(path));
    if (session) record(slug, session);
    return slug;
  }
  if (isIn(path, plansHome())) {
    if (session) record(path, session);
    return documentSlug(path);
  }
  const slug = Tracked.track(path);
  if (session) record(slug, session);
  return slug;
}

export default defineEventHandler(async (event): Promise<FileOpenReply> => {
  const raw: unknown = await readBody(event);
  const given = fieldOf(raw, "path");
  if (!given) throw createError({ statusCode: 400, statusMessage: "a path is needed" });
  const base = fieldOf(raw, "base");
  const full = resolve(base ? expandHome(base) : homedir(), expandHome(given));
  if (!statSync(full, { throwIfNoEntry: false })?.isFile())
    throw createError({ statusCode: 404, statusMessage: `no file at ${full}` });
  const real = realpathSync(full);
  if (!Tracked.isTrackable(real)) return { at: "files", path: real };
  const session = fieldOf(raw, "session").toLowerCase();
  return { at: "artifacts", slug: slugOf(real, isKey(session) ? session : "") };
});
