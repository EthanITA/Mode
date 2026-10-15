import { mkdirSync, watch } from "node:fs";
import { basename, dirname } from "node:path";
import * as Events from "~~/lib/sidecar/events.ts";

// Each SSE message is named after its topic and carries its offset as the id, so a browser's own reconnect resumes it.
export default defineEventHandler((event): Promise<void> => {
  const stream = createEventStream(event);
  const query = getQuery(event);
  const topics = new Set([query.topic].flat().filter((one): one is string => typeof one === "string"));
  const since = Number(query.since ?? getHeader(event, "last-event-id"));
  // No offset reads from the end, the way a new Kafka consumer starts at latest.
  let offset = Number.isFinite(since) && since >= 0 ? since : Events.end();

  const emit = (): void => {
    const slice = Events.read(offset);
    offset = slice.offset;
    for (const one of slice.events) {
      if (topics.size && !topics.has(one.topic)) continue;
      void stream.push({ id: String(one.offset), event: one.topic, data: JSON.stringify(one) });
    }
  };

  // The folder, not the file: the log may not exist until the first event is published.
  const folder = dirname(Events.logFile());
  mkdirSync(folder, { recursive: true });
  const watcher = watch(folder, (_, name) => {
    if (name === basename(Events.logFile())) emit();
  });
  watcher.on("error", () => watcher.close());
  stream.onClosed(() => watcher.close());
  emit();
  // Hands a consumer that saw no event yet the offset it resumes from after a reconnect.
  void stream.push({ id: String(offset), event: "ready", data: String(offset) });
  return stream.send();
});
