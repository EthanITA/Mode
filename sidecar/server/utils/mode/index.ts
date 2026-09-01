import { contracts } from "./contracts-api.ts"
import { pins } from "./pins.ts"
import { sessions } from "./sessions.ts"
import { why } from "./why.ts"

export const Mode = { why, sessions, contracts, pins } as const

// shared/types/mode.ts re-exports exactly this set from here; keep the two lists in sync.
export type { Axis } from "./constants.ts"
export type { Contract } from "./contracts-api.ts"
export type { ContractLoop, PipelineStep } from "./contracts.ts"
export type { Gate, How, Pipeline, Slot, Why } from "./types.ts"
