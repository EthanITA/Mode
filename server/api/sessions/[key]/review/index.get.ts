import type { ReviewSnapshot } from "~~/shared/types/review";
import { snapshotOf } from "~~/server/utils/review/ledger";
import { keyOf } from "~~/server/utils/sessions/paths";
import { liveEntries } from "~~/server/utils/sessions/registry";

export default defineEventHandler((event): ReviewSnapshot => {
  const key = getRouterParam(event, "key") || "";
  return snapshotOf({ key, live: liveEntries().some((entry) => keyOf(entry.id) === key) });
});
