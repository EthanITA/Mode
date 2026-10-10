import type { FileSave } from "~~/shared/types/files";
import { saveContent } from "~~/server/utils/sessions/files";

export default defineEventHandler(async (event): Promise<FileSave> => {
  const key = getRouterParam(event, "key") || "";
  const raw: unknown = await readBody(event);
  const { path, text, base } = (typeof raw === "object" && raw ? raw : {}) as Record<string, unknown>;
  // An empty text is a real save, so only its type is checked.
  if (typeof path !== "string" || !path || typeof text !== "string" || typeof base !== "string" || !base) {
    throw createError({ statusCode: 400, statusMessage: "path, text and base are required" });
  }
  return saveContent({ key, path, text, base });
});
