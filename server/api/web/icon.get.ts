import { siteIcon } from "~~/server/utils/web/icon";

function originOf(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export default defineEventHandler(async (event): Promise<Uint8Array> => {
  const origin = originOf(getQuery(event).origin);
  if (!origin) throw createError({ statusCode: 400, statusMessage: "give the site's http or https origin" });
  const icon = await siteIcon({ origin, userAgent: getRequestHeader(event, "user-agent") });
  if (!icon) throw createError({ statusCode: 404, statusMessage: `no icon found on ${origin}` });
  // Served from the sidecar's own origin, so an SVG opened directly must not run its scripts here.
  setResponseHeaders(event, {
    "cache-control": "max-age=86400",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "content-type": icon.type,
    "x-content-type-options": "nosniff",
  });
  return icon.body;
});
