import { resolve } from "node:path";
import { isFile } from "~~/lib/files";
import { Media } from "~~/server/utils/media";
import { isReachable } from "~~/server/utils/sessions/files";

// The path rides in the URL rather than the query, so a page's relative assets resolve to their own files here.
export default defineEventHandler((event): Promise<unknown> => {
  const key = getRouterParam(event, "key") || "";
  const path = resolve("/", getRouterParam(event, "path", { decode: true }) ?? "");
  if (!isReachable({ key, path }) || !isFile(path)) throw createError({ statusCode: 404, statusMessage: "not here" });
  return Media.send(event, { file: path, isMarkdownPage: getQuery(event).as === "page", name: path });
});
