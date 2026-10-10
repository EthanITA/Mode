import { createHash } from "node:crypto";
import { mkdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { readTextSafe } from "../files.ts";
import { sidecarHome } from "../mode/paths.ts";

export type CommentsDoc = Record<string, unknown> & { threads: unknown[] };

// A .md has no <script> to hold its threads, so an artifact keeps them in one trailing comment.
const MD_SEED = /(<!-- rv:seed\n)([\s\S]*?)(\n-->\n?)/;

function realPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

// Hashed on the real path, native so case settles too, so a symlink or a Mode/mode alias is one document; the hash keeps two README.md apart.
export function documentSlug(path: string): string {
  const real = realPath(path);
  const stem = basename(real, extname(real)).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `${stem}--${createHash("sha1").update(real).digest("hex").slice(0, 6)}`;
}

// A .md outside the artifacts folder is somebody's document, so its comments stay out of it.
export function isStoredDocument(path: string, artifactsDir: string): boolean {
  return path.endsWith(".md") && dirname(path) !== artifactsDir;
}

export function commentsFile(path: string): string {
  return join(sidecarHome(), "comments", `${documentSlug(path)}.json`);
}

function parse(text: string | undefined): CommentsDoc | undefined {
  if (!text) return undefined;
  try {
    const doc: unknown = JSON.parse(text);
    if (typeof doc !== "object" || !doc || !("threads" in doc) || !Array.isArray(doc.threads)) return undefined;
    return doc as CommentsDoc;
  } catch {
    return undefined;
  }
}

// What a document held before comments left it: the store wins, the old block is read until the first write moves it.
export function readComments(path: string, text: string): CommentsDoc | undefined {
  return parse(readTextSafe(commentsFile(path))) ?? parse(MD_SEED.exec(text)?.[2]);
}

export function writeComments(path: string, doc: CommentsDoc): void {
  const file = commentsFile(path);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ ...doc, v: 1, path: realPath(path) })}\n`);
  renameSync(tmp, file);
}

export function hasLegacyBlock(text: string): boolean {
  return MD_SEED.test(text);
}

export function withoutLegacyBlock(text: string): string {
  return text.replace(MD_SEED, "").replace(/\n+$/, "\n");
}
