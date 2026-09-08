import { watch, type FSWatcher } from "node:fs"
import { conversationOf } from "~~/server/utils/sessions/conversation"
import { transcriptIndex } from "~~/server/utils/sessions/transcripts"

export default defineEventHandler((event): Promise<void> => {
  const key = getRouterParam(event, "key") || ""
  const stream = createEventStream(event)
  // Resuming from the client's offset closes the gap between its backfill and this connection opening.
  const since = Number(getQuery(event).since)
  let offset = Number.isFinite(since) && since > 0 ? since : conversationOf({ key }).offset
  let watcher: FSWatcher | undefined

  const emit = (): void => {
    const slice = conversationOf({ key, since: offset })
    offset = slice.offset
    for (const turn of slice.turns) {
      void stream.push({ event: "turn", data: JSON.stringify(turn) })
    }
  }

  const path = transcriptIndex().get(key)?.path
  if (path) {
    try {
      watcher = watch(path, emit)
      watcher.on("error", () => watcher?.close())
    } catch {
      watcher = undefined
    }
  }

  stream.onClosed(() => {
    watcher?.close()
  })

  return stream.send()
})
