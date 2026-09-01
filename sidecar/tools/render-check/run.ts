import { writeFileSync } from 'node:fs'
import { Cdp } from './cdp.ts'
import { launchChrome } from './chrome.ts'
import { probeScreen } from './probe.ts'
import { judgeEvents, judgeState, renderReport } from './report.ts'
import { PLACEHOLDER_PATTERNS, REGIONS } from './regions.ts'
import { ensureServer } from './server.ts'
import type { Finding, PageEvent, ProbeInput, ProbeResult, RenderReport, StateReport } from './types.ts'

interface Options {
  url: string
  autoStart: boolean
  width: number
  height: number
  json?: string
  settleMs: number
  extraIds: string[]
}

const HELP = `mode sidecar · render check

Renders the running app in headless Chrome and reports what is actually on the
screen, region by region. Structure and presence only — never taste.

  npm run check:render                 attach to a running app, or start one
  npm run check:render -- --json r.json  also write the structured report

  --url <url>        default http://localhost:$NUXT_PORT, else :3000; file:// works too
  --no-start         fail rather than starting a dev server
  --viewport <WxH>   default 1440x900
  --settle <ms>      how long to wait for the DOM to stop changing, default 8000
  --known-ids <a,b>  extra session ids to treat as leaks if they reach the screen
  --json <path>      write the full machine-readable report
  --help

Exit code is 1 when a region the design fills has nothing in it.
`

function parseArgs(argv: string[]): Options {
  const options: Options = {
    url: `http://localhost:${process.env.NUXT_PORT || process.env.PORT || '3000'}`,
    autoStart: true,
    width: 1440,
    height: 900,
    settleMs: 8_000,
    extraIds: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(HELP)
      process.exit(0)
    } else if (arg === '--no-start') {
      options.autoStart = false
    } else if (arg === '--url') {
      options.url = argv[++i] ?? options.url
    } else if (arg === '--known-ids') {
      options.extraIds = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    } else if (arg === '--json') {
      options.json = argv[++i]
    } else if (arg === '--settle') {
      options.settleMs = Number(argv[++i]) || options.settleMs
    } else if (arg === '--viewport') {
      const [w, h] = (argv[++i] ?? '').split('x')
      options.width = Number(w) || options.width
      options.height = Number(h) || options.height
    }
  }
  return options
}

interface EvaluateResponse<T> {
  result: { value?: T }
  exceptionDetails?: { text: string; exception?: { description?: string } }
}

async function evaluate<T>(cdp: Cdp, sessionId: string, expression: string): Promise<T> {
  const response = await cdp.send<EvaluateResponse<T>>(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  )
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  }
  return response.result.value as T
}

interface SettleSample {
  elements: number
  frames: number
  framesReady: number
}

async function waitForSettle(cdp: Cdp, sessionId: string, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs
  let previous = -1
  let stable = 0
  while (Date.now() < deadline) {
    const sample = await evaluate<SettleSample>(
      cdp,
      sessionId,
      `(() => {
        const frames = Array.from(document.querySelectorAll('iframe'))
        let ready = 0
        for (const f of frames) {
          try { if (f.contentDocument && f.contentDocument.readyState === 'complete') ready++ }
          catch { ready++ }
        }
        return { elements: document.querySelectorAll('*').length, frames: frames.length, framesReady: ready }
      })()`,
    )
    const quiet = sample.elements === previous && sample.frames === sample.framesReady
    stable = quiet ? stable + 1 : 0
    previous = sample.elements
    if (stable >= 3) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

interface ApiSession {
  id?: string
  key?: string
  name?: string
  live?: boolean
}

async function readSessions(url: string): Promise<ApiSession[]> {
  try {
    const response = await fetch(new URL('/api/sessions', url), { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return []
    const body: unknown = await response.json()
    return Array.isArray(body) ? (body as ApiSession[]) : []
  } catch {
    return []
  }
}

function wirePageEvents(cdp: Cdp, events: PageEvent[]): void {
  const urls = new Map<string, string>()

  cdp.on('Runtime.exceptionThrown', (params) => {
    const details = (params as { exceptionDetails?: { text?: string; exception?: { description?: string } } }).exceptionDetails
    events.push({
      kind: 'exception',
      detail: details?.exception?.description ?? details?.text ?? 'unknown exception',
    })
  })

  cdp.on('Runtime.consoleAPICalled', (params) => {
    const typed = params as { type?: string; args?: { value?: unknown; description?: string }[] }
    if (typed.type !== 'error') return
    const text = (typed.args ?? [])
      .map((arg) => arg.description ?? String(arg.value ?? ''))
      .join(' ')
      .trim()
    events.push({ kind: 'console-error', detail: text || 'console.error with no arguments' })
  })

  cdp.on('Network.requestWillBeSent', (params) => {
    const typed = params as { requestId?: string; request?: { url?: string } }
    if (typed.requestId && typed.request?.url) urls.set(typed.requestId, typed.request.url)
  })

  cdp.on('Network.loadingFailed', (params) => {
    const typed = params as { requestId?: string; errorText?: string; canceled?: boolean }
    if (typed.canceled) return
    const url = urls.get(typed.requestId ?? '') ?? '(unknown url)'
    events.push({ kind: 'request-failed', detail: `${url} — ${typed.errorText ?? 'load failed'}` })
  })

  cdp.on('Network.responseReceived', (params) => {
    const typed = params as { response?: { url?: string; status?: number } }
    const status = typed.response?.status ?? 0
    if (status < 400) return
    events.push({ kind: 'request-failed', detail: `${typed.response?.url ?? '(unknown url)'} — HTTP ${status}` })
  })
}

async function probe(cdp: Cdp, sessionId: string, input: ProbeInput): Promise<ProbeResult> {
  const expression = `(${probeScreen.toString()})(${JSON.stringify(input)})`
  return evaluate<ProbeResult>(cdp, sessionId, expression)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  // a file:// target is a static fixture: nothing to serve and no api to ask
  const isFile = options.url.startsWith('file:')
  const server = isFile
    ? { url: options.url, spawned: false, stop: (): void => {} }
    : await ensureServer(options.url, options.autoStart, 90_000)
  const sessions = isFile ? [] : await readSessions(options.url)

  const knownIds: string[] = [...options.extraIds]
  for (const session of sessions) {
    if (session.id) knownIds.push(session.id)
    if (session.key) knownIds.push(session.key)
  }
  const expectedNames = sessions.filter((s) => s.live && s.name).map((s) => s.name ?? '')

  const probeInput: ProbeInput = {
    regions: REGIONS.map((spec) => ({ id: spec.id, selectors: spec.selectors, frame: spec.frame })),
    knownIds,
    expectedNames,
    placeholderPatterns: PLACEHOLDER_PATTERNS,
  }

  const chrome = await launchChrome(options.width, options.height, 20_000)
  const events: PageEvent[] = []
  const states: StateReport[] = []

  try {
    const cdp = await Cdp.connect(chrome.wsUrl, 10_000)
    const target = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
    const attached = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    })
    const sessionId = attached.sessionId

    wirePageEvents(cdp, events)
    await cdp.send('Page.enable', {}, sessionId)
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: options.width,
      height: options.height,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId)

    await cdp.send('Page.navigate', { url: options.url }, sessionId, 60_000)
    const settledOpen = await waitForSettle(cdp, sessionId, options.settleMs)
    const openProbe = await probe(cdp, sessionId, probeInput)
    states.push({ state: 'open', reached: true, settled: settledOpen, probe: openProbe })

    if (openProbe.panelToggle) {
      await evaluate<boolean>(
        cdp,
        sessionId,
        `(() => { const el = document.querySelector('[data-region-toggle="panel"],[data-panel-toggle]'); if (!el) return false; el.click(); return true })()`,
      )
      const settledClosed = await waitForSettle(cdp, sessionId, options.settleMs)
      const closedProbe = await probe(cdp, sessionId, probeInput)
      states.push({ state: 'closed', reached: true, settled: settledClosed, probe: closedProbe })
    } else {
      states.push({
        state: 'closed',
        reached: false,
        settled: false,
        skipped: 'no control carries data-region-toggle="panel", so the panel-closed state cannot be reached',
      })
    }

    await cdp.send('Browser.close').catch(() => undefined)
    cdp.close()
  } finally {
    chrome.stop()
    server.stop()
  }

  const findings: Finding[] = judgeEvents(events)
  for (const state of states) {
    if (state.probe) findings.push(...judgeState(state.state, state.probe))
  }

  const report: RenderReport = {
    url: options.url,
    startedAt: new Date().toISOString(),
    viewport: { width: options.width, height: options.height },
    sessions: sessions.map((s) => ({
      id: s.id ?? '',
      key: s.key ?? '',
      name: s.name,
      live: Boolean(s.live),
    })),
    states,
    events,
    findings,
    verdict: findings.some((f) => f.severity === 'fail') ? 'fail' : 'pass',
  }

  if (options.json) writeFileSync(options.json, `${JSON.stringify(report, undefined, 2)}\n`)
  process.stdout.write(`${renderReport(report)}\n`)
  process.exit(report.verdict === 'fail' ? 1 : 0)
}

main().catch((error: unknown) => {
  process.stderr.write(`render check could not run: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(2)
})
