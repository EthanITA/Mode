import { execFile } from "node:child_process"
import { join } from "node:path"
import { promisify } from "node:util"
import type { ConversationVersions, DiffTarget, FileDiff, RestoreResult, VersionContent } from "../../../shared/types/versions.ts"
import { pluginRoot } from "../mode/paths.ts"

const run = promisify(execFile)
const BUDGET_MS = 120_000

// Nitro never opens the store: two sessions and a browser writing one git index is what this avoids.
async function call<T>(args: string[]): Promise<T | undefined> {
  try {
    const { stdout } = await run(process.execPath, ["--experimental-strip-types", join(pluginRoot(), "bin", "versions.ts"), ...args], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      timeout: BUDGET_MS,
    })
    return stdout ? (JSON.parse(stdout) as T) : undefined
  } catch {
    return undefined
  }
}

export const Versions = {
  async list({ key, path }: Versions.Query): Promise<ConversationVersions> {
    const found = await call<ConversationVersions>(["list", key, ...(path ? ["--path", path] : [])])
    return found || { key, turns: 0, bytes: 0, files: [] }
  },

  async content({ key, path, turn }: Versions.At): Promise<VersionContent> {
    const got = await call<VersionContent>(["show", key, "--path", path, "--turn", String(turn)])
    return got || { path, turn, found: false, reason: "store-failed" }
  },

  async diff({ key, path, from, to }: Versions.Range): Promise<FileDiff> {
    const found = await call<FileDiff>(["diff", key, "--path", path, "--from", String(from), "--to", String(to)])
    return found || { path, from, to, computed: false, reason: "store-failed" }
  },

  async restore({ key, path, turn, force }: Versions.At): Promise<RestoreResult> {
    const found = await call<RestoreResult>(["restore", key, "--path", path, "--turn", String(turn), ...(force ? ["--force"] : [])])
    return found || { path, turn, restored: false, reason: "the version store could not be reached" }
  },
}

export namespace Versions {
  export interface Query {
    key: string
    path?: string
  }

  export interface At {
    key: string
    path: string
    turn: number
    force?: boolean
  }

  export interface Range {
    key: string
    path: string
    from: number
    to: DiffTarget
  }
}
