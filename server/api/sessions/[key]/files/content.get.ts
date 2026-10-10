import type { FileContent } from "~~/shared/types/files";
import { contentOf } from "~~/server/utils/sessions/files";

export default defineEventHandler((event): FileContent => {
  const key = getRouterParam(event, "key") || "";
  const path = String(getQuery(event).path ?? "");
  return contentOf({ key, path });
});
