import { readdirSync } from "node:fs"
import { createConnection } from "node:net"
import { join } from "node:path"
import { readTextSafe } from "../../../lib/files.ts"
import { keyOf, registryHome } from "./paths.ts"
import { liveEntries } from "./registry.ts"
import { marked } from "./relay.ts"

const HANG_BUDGET_MS = 2000

export function keyFileOf(pid: number): string | undefined {
  let names: string[]
  try {
    names = readdirSync(registryHome())
  } catch {
    return undefined
  }
  const name = names.find((one) => {
    const [left, hash, key, extra] = one.split(".")
    return left === String(pid) && !!hash && !!key && !extra
  })
  if (!name) return undefined
  return join(registryHome(), name)
}

export type SendOptions = {
  socketPath: string
  token: string
  text: string
  slug?: string
}


export type SendResult = { ok: true } | { ok: false }

export type DeliverOptions = { key: string; text: string; slug?: string }

export type DeliverResult =
  | { delivered: true; session: string }
  | { delivered: false; reason: "no-live-session" | "refused-by-inbox" }

// The newest live process under the key wins: a resumed session leaves its old pid's entry behind.
export async function deliver({ key, text, slug }: DeliverOptions): Promise<DeliverResult> {
  const [entry] = liveEntries()
    .filter((one) => keyOf(one.id) === key)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  if (!entry) return { delivered: false, reason: "no-live-session" }
  const token = readTextSafe(keyFileOf(entry.pid))?.trim()
  if (!entry.messagingSocketPath || !token) return { delivered: false, reason: "refused-by-inbox" }
  const result = await sendToInbox({ socketPath: entry.messagingSocketPath, token, text, slug })
  return result.ok ? { delivered: true, session: keyOf(entry.id) } : { delivered: false, reason: "refused-by-inbox" }
}

// Nitro auto-imports every server util, so a bare `send` would shadow h3's own response helper.
export function sendToInbox({ socketPath, token, text, slug }: SendOptions): Promise<SendResult> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const socket = createConnection({ path: socketPath })
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!ok) socket.destroy()
      resolve(ok ? { ok: true } : { ok: false })
    }
    // A vanished listener leaves the socket file behind; two seconds is the hang budget.
    timer = setTimeout(() => finish(false), HANG_BUDGET_MS)
    socket.on("error", () => finish(false))
    socket.on("connect", () => {
      const auth = JSON.stringify({ type: "auth", token })
      const user = JSON.stringify({ type: "user", message: { role: "user", content: marked(text, slug) } })
      socket.write(`${auth}\n${user}\n`, (error) => {
        socket.end()
        finish(!error)
      })
    })
  })
}
