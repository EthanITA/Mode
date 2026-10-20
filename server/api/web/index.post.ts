import { ArtifactLists } from "~~/lib/sidecar/lists";
import { openRecord } from "~~/lib/web/records";
import { addressOf } from "~~/lib/web/target";
import { isKey } from "~~/server/utils/sessions/paths";
import type { WebOpenReply } from "~~/shared/types/web";

function fieldOf(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  return typeof value === "string" ? value.trim() : "";
}

export default defineEventHandler(async (event): Promise<WebOpenReply> => {
  const raw: unknown = await readBody(event);
  const body = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};
  const url = addressOf(fieldOf(body, "url"));
  if (!url) throw createError({ statusCode: 400, statusMessage: "type an address or something to search for" });
  const session = fieldOf(body, "session").toLowerCase();
  const isOurs = isKey(session);
  const { isNew, record: entry } = openRecord({
    reuse: body.reuse === true && isOurs ? ArtifactLists.entries(session) : [],
    title: fieldOf(body, "title") || undefined,
    url,
  });
  if (isOurs) ArtifactLists.record(entry.slug, session);
  return { isNew, slug: entry.slug, url: entry.url };
});
