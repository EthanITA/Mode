import { contracts } from "./contracts-api.ts"
import { pins } from "./pins.ts"
import { sessions } from "./sessions.ts"
import { why } from "./why.ts"

export const Mode = { why, sessions, contracts, pins } as const
