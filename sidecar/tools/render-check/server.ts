import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ServerHandle {
  url: string
  spawned: boolean
  stop: () => void
}

export async function reachable(url: string, timeoutMs = 2_000): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return response.ok
  } catch {
    return false
  }
}

export async function ensureServer(url: string, autoStart: boolean, timeoutMs: number): Promise<ServerHandle> {
  if (await reachable(url)) return { url, spawned: false, stop: (): void => {} }
  if (!autoStart) {
    throw new Error(`Nothing is serving ${url} and --no-start was given. Start the app, or drop --no-start.`)
  }

  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const child: ChildProcess = spawn('npm', ['run', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false,
  })
  const stop = (): void => {
    try {
      child.kill('SIGTERM')
    } catch {
      // already gone
    }
  }

  let died = false
  child.on('exit', () => {
    died = true
  })

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
    if (await reachable(url)) return { url, spawned: true, stop }
    if (died) break
  }
  stop()
  throw new Error(
    `Started \`npm run dev\` but ${url} never answered within ${timeoutMs}ms. ` +
      `If the app is already running on another port, pass --url, or set NUXT_PORT.`,
  )
}
