import { removeRecord, type WebRecord } from "~~/lib/web/records";

// The whole record comes back, since putting it back is Undo's to do from the sidecar.
export default defineEventHandler((event): WebRecord => {
  const slug = getRouterParam(event, "slug") ?? "";
  const gone = removeRecord(slug);
  if (!gone) throw createError({ statusCode: 404, statusMessage: `no web entry '${slug}'` });
  return gone;
});
