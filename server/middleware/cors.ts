import { isFencedOrigin } from "~~/server/utils/web/proxy";

export default defineEventHandler((event): string | undefined => {
  if (!getRequestPath(event).startsWith("/api/")) return;
  if (isFencedOrigin(getRequestHeader(event, "origin")))
    throw createError({ statusCode: 403, statusMessage: "a remote site opened in the sidecar can't reach its API" });

  // file:// documents send Origin: null, so the wildcard is what makes the post land at all.
  setResponseHeader(event, "Access-Control-Allow-Origin", "*");
  setResponseHeader(event, "Access-Control-Allow-Headers", "content-type");

  if (getMethod(event) === "OPTIONS") return "";
});
