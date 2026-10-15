import { liveSessions } from "~~/server/utils/sessions";
import type { LiveSession } from "../../shared/types/session";

export default defineEventHandler((event): LiveSession[] => {
  const query = getQuery(event);
  const key = typeof query.key === "string" && query.key ? query.key : undefined;
  return liveSessions({ scope: query.scope === "live" ? "live" : "all", key });
});
