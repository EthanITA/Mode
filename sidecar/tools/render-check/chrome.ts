import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CANDIDATES: string[] = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

export function findChrome(): string | undefined {
  const fromEnv = process.env.CHROME_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  return CANDIDATES.find((path) => existsSync(path))
}

export interface ChromeHandle {
  wsUrl: string
  stop: () => void
}

export function launchChrome(width: number, height: number, timeoutMs: number): Promise<ChromeHandle> {
  const binary = findChrome()
  if (!binary) {
    return Promise.reject(
      new Error(
        'No Chrome, Chromium or Edge found. Set CHROME_PATH to a Chromium-family binary and re-run.',
      ),
    )
  }

  const profile = mkdtempSync(join(tmpdir(), 'sidecar-render-check-'))
  const child: ChildProcess = spawn(
    binary,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )

  const stop = (): void => {
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      // a leftover temp profile is harmless
    }
  }

  return new Promise<ChromeHandle>((resolve, reject) => {
    let stderr = ''
    const timer = setTimeout(() => {
      stop()
      reject(new Error(`Chrome did not report a debugging endpoint within ${timeoutMs}ms.\n${stderr}`))
    }, timeoutMs)

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/)
      if (!match?.[1]) return
      clearTimeout(timer)
      resolve({ wsUrl: match[1], stop })
    })

    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Chrome exited with code ${String(code)} before listening.\n${stderr}`))
    })
  })
}
