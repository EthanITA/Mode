export interface Sequenced {
  role: string;
  text: string;
}

// A compaction emits the same note from two entries seconds apart, so `at` cannot join them.
export function echoesNote(turn: Sequenced, previous?: Sequenced): boolean {
  return !!previous && turn.role === "system" && previous.role === "system" && previous.text === turn.text;
}
