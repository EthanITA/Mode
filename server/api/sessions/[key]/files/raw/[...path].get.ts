import { resolve } from "node:path";
import { isFile } from "~~/lib/files";
import { Media } from "~~/server/utils/media";
import { originalOf } from "~~/server/utils/review/ledger";
import { isReachable } from "~~/server/utils/sessions/files";

// The path rides in the URL rather than the query, so a page's relative assets resolve to their own files here.
export default defineEventHandler((event): Promise<unknown> => {
  const key = getRouterParam(event, "key") || "";
  const path = resolve("/", getRouterParam(event, "path", { decode: true }) ?? "");
  const isReviewed = originalOf({ key, path }).kind !== "untracked";
  if (!(isReviewed || isReachable({ key, path })) || !isFile(path)) {
    throw createError({ statusCode: 404, statusMessage: "not here" });
  }
  return Media.send(event, { file: path, isMarkdownPage: getQuery(event).as === "page", name: path });
});
