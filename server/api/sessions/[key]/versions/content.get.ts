import type { VersionContent } from "~~/shared/types/versions";
import { stripReviewLayer } from "~~/server/utils/artifacts";
import { Versions } from "~~/server/utils/sessions/versions";

export default defineEventHandler(async (event): Promise<VersionContent> => {
  const key = getRouterParam(event, "key") || "";
  const { path, turn } = getQuery(event);
  if (typeof path !== "string" || !path) return { path: "", turn: 0, found: false, reason: "missing-content" };
  const got = await Versions.content({ key, path, turn: Number(turn) || 0 });
  // Drawn in the sidecar like the live page, whose gutter already holds the notes.
  return got.found && path.endsWith(".html") ? { ...got, content: stripReviewLayer(got.content) } : got;
});
