import { record } from "~~/lib/artifact/store";
import { openRecord } from "~~/lib/web/records";
import { parseTarget } from "~~/lib/web/target";
import { isKey } from "~~/server/utils/sessions/paths";
import type { WebOpenReply } from "~~/shared/types/web";
import { Trail } from "~~/shared/utils/trail";

function fieldOf(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  return typeof value === "string" ? value.trim() : "";
}

export default defineEventHandler(async (event): Promise<WebOpenReply> => {
  const raw: unknown = await readBody(event);
  const body = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};
  const url = parseTarget(fieldOf(body, "url"));
  if (!url)
    throw createError({ statusCode: 400, statusMessage: "an http or https address is the only kind that opens" });
  // A page the frame already shows, or a redirect it is following, is where the site landed, so only a typed URL is chased.
  const { isNew, record: entry } = await openRecord({
    title: fieldOf(body, "title") || undefined,
    trail: Trail.of(body.trail),
    typed: body.landed !== true,
    url,
  });
  const session = fieldOf(body, "session").toLowerCase();
  if (isKey(session)) record(entry.slug, session);
  return { isNew, port: entry.port, slug: entry.slug, url: entry.url };
});
