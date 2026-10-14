import { record } from "~~/lib/artifact/store";
import { openRecord, parseTarget } from "~~/lib/web/records";
import { isKey } from "~~/server/utils/sessions/paths";
import type { WebOpenReply } from "~~/shared/types/web";

function fieldOf(raw: unknown, name: string): string {
  const value = typeof raw === "object" && raw ? (raw as Record<string, unknown>)[name] : "";
  return typeof value === "string" ? value.trim() : "";
}

export default defineEventHandler(async (event): Promise<WebOpenReply> => {
  const raw: unknown = await readBody(event);
  const url = parseTarget(fieldOf(raw, "url"));
  if (!url)
    throw createError({ statusCode: 400, statusMessage: "an http or https address is the only kind that opens" });
  const entry = openRecord({ title: fieldOf(raw, "title") || undefined, url });
  const session = fieldOf(raw, "session").toLowerCase();
  if (isKey(session)) record(entry.slug, session);
  return { port: entry.port, slug: entry.slug, url: entry.url };
});
