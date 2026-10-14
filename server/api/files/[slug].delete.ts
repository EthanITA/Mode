import { Tracked } from "~~/lib/sidecar/tracked";

// The file itself and its threads stay, so opening it again brings the entry back as it was.
export default defineEventHandler((event): { path: string } => {
  const slug = getRouterParam(event, "slug") ?? "";
  const path = Tracked.untrack(slug);
  if (!path) throw createError({ statusCode: 404, statusMessage: `no file entry '${slug}'` });
  return { path };
});
