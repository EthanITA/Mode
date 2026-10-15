import { resolve } from "node:path";
import { isFile } from "~~/lib/files";
import { Media } from "~~/server/utils/media";
import { originalOf } from "~~/server/utils/review/ledger";
import { isReachable } from "~~/server/utils/sessions/files";

// An asset the review does not track was never changed, so an original page loads it from the disk as it is.
export default defineEventHandler((event): Promise<unknown> => {
  const key = getRouterParam(event, "key") || "";
  const path = resolve("/", getRouterParam(event, "path", { decode: true }) ?? "");
  const isMarkdownPage = getQuery(event).as === "page";
  const original = originalOf({ key, path });
  if (original.kind === "blob") return Media.send(event, { file: original.file, isMarkdownPage, name: path });
  if (original.kind === "created" || !isReachable({ key, path }) || !isFile(path)) {
    throw createError({ statusCode: 404, statusMessage: "no original" });
  }
  return Media.send(event, { file: path, isMarkdownPage, name: path });
});
