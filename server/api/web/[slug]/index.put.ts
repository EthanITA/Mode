import { restoreRecord } from "~~/lib/web/records";
import type { WebOpenReply } from "~~/shared/types/web";

export default defineEventHandler(async (event): Promise<WebOpenReply> => {
  const slug = getRouterParam(event, "slug") ?? "";
  const raw: unknown = await readBody(event);
  const back = typeof raw === "object" && raw && "slug" in raw && raw.slug === slug ? restoreRecord(raw) : undefined;
  if (!back) throw createError({ statusCode: 400, statusMessage: `that is not the web entry '${slug}'` });
  return { isNew: true, slug: back.slug, url: back.url };
});
