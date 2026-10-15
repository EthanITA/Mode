export default defineEventHandler((event): Promise<void> | undefined => {
  const url = getRequestURL(event);
  // A site opens on a subdomain of the sidecar's host, and one under plain localhost is cross-site to it, so no login sticks.
  if (url.hostname !== "localhost" || getRequestHeader(event, "sec-fetch-dest") !== "document") return;
  return sendRedirect(event, `${url.protocol}//sidecar.localhost:${url.port}${url.pathname}${url.search}`, 302);
});
