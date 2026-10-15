import type { LiveSession } from "../types/session.ts";

// Live first because the design shows only those as tabs; then the conversations `claude agents`
// owns, because the desk opens on those; the rest is history, newest first.
export function sessionOrder(a: LiveSession, b: LiveSession): number {
  if (a.live !== b.live) return a.live ? -1 : 1;
  if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
  return (b.lastActive || 0) - (a.lastActive || 0);
}
