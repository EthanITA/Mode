import { followTarget } from "~~/server/utils/review/follow"

const EVERY_MS = 1000

// Polls only while a page holds this stream open, and pushes only when the target moves.
export default defineEventHandler((event): Promise<void> => {
  const stream = createEventStream(event)
  let sent = ""

  const tick = async (): Promise<void> => {
    const target = JSON.stringify(await followTarget())
    if (target === sent) return
    sent = target
    void stream.push({ event: "follow", data: target })
  }

  const timer = setInterval(() => void tick(), EVERY_MS)
  stream.onClosed(() => clearInterval(timer))
  void tick()
  return stream.send()
})
