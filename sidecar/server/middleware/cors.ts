export default defineEventHandler((event): string | undefined => {
  if (!getRequestPath(event).startsWith("/api/")) return

  // file:// documents send Origin: null, so the wildcard is what makes the post land at all.
  setResponseHeader(event, "Access-Control-Allow-Origin", "*")
  setResponseHeader(event, "Access-Control-Allow-Headers", "content-type")

  if (getMethod(event) === "OPTIONS") return ""
})
