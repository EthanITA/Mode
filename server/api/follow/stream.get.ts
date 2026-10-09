import { followTarget, onFollow } from "~~/server/utils/review/follow"

// Counted as a listener while open, which is how `/sidecar` knows a page is already showing.
export default defineEventHandler((event): Promise<void> => {
  const stream = createEventStream(event)
  const push = (target: unknown): void => void stream.push({ event: "follow", data: JSON.stringify(target) })
  const stop = onFollow(push)
  stream.onClosed(stop)
  push(followTarget())
  return stream.send()
})
