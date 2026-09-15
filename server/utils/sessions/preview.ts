import type { SessionPreview } from "../../../shared/types/session.ts"
import { canvasOf } from "./canvas.ts"

// Positions only: the desk thumbnail needs the shape of the plane, never what a note says.
export function previewOf(key: string): SessionPreview | undefined {
  const placement = canvasOf(key)
  if (!placement) return undefined
  const cards = Object.entries(placement.cards || {}).map(([slug, at]) => ({
    slug,
    x: at.x,
    y: at.y,
    width: at.width,
  }))
  const notes = (placement.notes || []).map((note) => ({ x: note.x, y: note.y, width: note.width }))
  return cards.length || notes.length ? { cards, notes } : undefined
}
