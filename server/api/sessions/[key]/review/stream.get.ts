import { mkdirSync, watch, type FSWatcher } from "node:fs";
import { basename } from "node:path";
import { ledgerDirOf, legacyReviewHome, reviewHome, snapshotOf } from "~~/server/utils/review/ledger";
import { keyOf } from "~~/server/utils/sessions/paths";
import { liveEntries } from "~~/server/utils/sessions/registry";

// The mod writes a blob and then review.json for one change, so a burst settles into one push.
const SETTLE_MS = 120;

export default defineEventHandler((event): Promise<void> => {
  const key = getRouterParam(event, "key") || "";
  const stream = createEventStream(event);
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const push = (): void => {
    const live = liveEntries().some((entry) => keyOf(entry.id) === key);
    void stream.push({ event: "review", data: JSON.stringify(snapshotOf({ key, live })) });
  };

  // Watching the parent folder catches the session's own folder being created by its first edit.
  mkdirSync(reviewHome(), { recursive: true });
  for (const home of [reviewHome(), legacyReviewHome()]) {
    try {
      const watcher = watch(home, { recursive: true }, (_kind, name) => {
        const dir = ledgerDirOf(key);
        if (!name || !dir || !String(name).startsWith(basename(dir))) return;
        clearTimeout(timer);
        timer = setTimeout(push, SETTLE_MS);
      });
      watcher.on("error", () => watcher.close());
      watchers.push(watcher);
    } catch {
      continue;
    }
  }

  stream.onClosed(() => {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  });

  push();
  return stream.send();
});
