import type { TreeListing } from "~~/shared/types/tree";
import { cwdOf, listingOf } from "~~/server/utils/tree";

// Rooted at the conversation's working directory, so a listing can never wander outside it.
export default defineEventHandler((event): TreeListing | undefined => {
  const root = cwdOf(getRouterParam(event, "key") || "");
  if (!root) return undefined;
  const query = getQuery(event);
  return listingOf({ root, dir: String(query.dir ?? root), showIgnored: query.ignored === "1" });
});
