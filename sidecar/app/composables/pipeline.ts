import type { Pipeline } from "~~/shared/types/mode"

export type StepState = "done" | "now" | "upcoming"

// D1 should already strip `@artifact`; stripped again here in case a raw step ever passes through.
export function displayStepName(step: string): string {
  return step.split("@")[0] ?? step
}

export function stepState(pipeline: Pipeline | undefined, step: string): StepState {
  if (!pipeline) return "upcoming"
  if (pipeline.done.includes(step)) return "done"
  if (pipeline.current === step) return "now"
  return "upcoming"
}

export function stepPosition(index: number, total: number): number {
  if (total <= 1) return 50
  return (index / (total - 1)) * 100
}
