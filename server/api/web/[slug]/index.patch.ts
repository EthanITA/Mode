import { updateRecord } from "~~/lib/web/records";
import { parseTarget } from "~~/lib/web/target";
import { Trail } from "~~/shared/utils/trail";

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const slug = getRouterParam(event, "slug") ?? "";
  const raw: unknown = await readBody(event);
  const body = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};
  const url = typeof body.url === "string" ? parseTarget(body.url) : undefined;
  if (!url) throw createError({ statusCode: 400, statusMessage: "a page moves only to an http or https address" });
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!updateRecord(slug, { title, trail: Trail.of(body.trail), url }))
    throw createError({ statusCode: 404, statusMessage: `no web entry '${slug}'` });
  return { ok: true };
});
