import { removeRecord, type WebRecord } from "~~/lib/web/records";
import { stop } from "~~/server/utils/web/proxy";

// The whole record comes back, since putting it back is Undo's to do from the sidecar.
export default defineEventHandler(async (event): Promise<WebRecord> => {
  const slug = getRouterParam(event, "slug") ?? "";
  const gone = removeRecord(slug);
  if (!gone) throw createError({ statusCode: 404, statusMessage: `no web entry '${slug}'` });
  await stop(gone.port);
  return gone;
});
