export interface CardPlacement {
  x: number
  y: number
  width?: number
  // Set only when the card was dragged out of the frame its creating turn implies.
  frame?: string
}

export interface CanvasNote {
  id: string
  x: number
  y: number
  width?: number
  text: string
  at: number
}

export interface CanvasPlacement {
  key: string
  // Keyed by artifact slug, never by list index: the artifact list reorders on every poll.
  cards: Record<string, CardPlacement>
  notes: CanvasNote[]
  // Frame ids the reader collapsed. Frames are derived, so only the deviation persists.
  collapsed: string[]
  at?: number
}

export function emptyPlacement(key: string): CanvasPlacement {
  return { key, cards: {}, notes: [], collapsed: [] }
}
