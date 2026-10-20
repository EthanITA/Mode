import { conversationOf } from "~~/server/utils/sessions/conversation";
import { transcripts, type TranscriptGrowth } from "~~/server/utils/sessions/transcripts";

export default defineEventHandler((event): Promise<void> => {
  const key = getRouterParam(event, "key") || "";
  const stream = createEventStream(event);
  // Resuming from the client's offset closes the gap between its backfill and this connection opening.
  const since = Number(getQuery(event).since);
  let offset = Number.isFinite(since) && since > 0 ? since : conversationOf({ key }).offset;

  const emit = (grown: TranscriptGrowth): void => {
    if (grown.key !== key) return;
    const slice = conversationOf({ key, path: grown.path, since: offset });
    offset = slice.offset;
    for (const turn of slice.turns) {
      void stream.push({ event: "turn", data: JSON.stringify(turn) });
    }
  };

  transcripts.on("grew", emit);
  stream.onClosed(() => {
    transcripts.off("grew", emit);
  });

  return stream.send();
});
