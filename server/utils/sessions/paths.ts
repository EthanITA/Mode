import { join } from "node:path"
import { configRoot } from "../mode/paths.ts"

export const KEY_LENGTH = 8

// Claude Code registers one file per live session process here, named by pid.
export function registryHome(): string {
  return join(configRoot(), "sessions")
}

export function projectsHome(): string {
  return join(configRoot(), "projects")
}

// One file per session, `session-<key>`, holding artifact slugs a line at a time.
export function artifactListsHome(): string {
  return join(configRoot(), "artifacts")
}

export function teamsHome(): string {
  return join(configRoot(), "teams")
}

// The join every other reader keys on: the first 8 hex of the session uuid.
export function keyOf(id: string): string {
  return id.slice(0, KEY_LENGTH).toLowerCase()
}

export function isKey(value: string): boolean {
  return /^[0-9a-f]{8}$/.test(value)
}

export function isSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
