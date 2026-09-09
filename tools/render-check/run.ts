import { writeFileSync } from 'node:fs'
import { Cdp } from './cdp.ts'
import { launchChrome } from './chrome.ts'
import { probeScreen } from './probe.ts'
import { Judge, renderReport } from './report.ts'
import { PLACEHOLDER_PATTERNS, REGIONS } from './regions.ts'
import { ensureServer } from './server.ts'
import type {
  Finding,
  PageEvent,
  ProbeInput,
  ProbeResult,
  RenderReport,
  ScreenState,
  StateReport,
} from './types.ts'

const FACES = ['canvas', 'read', 'history'] as const

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

  pnpm check:render                attach to the running app
  pnpm check:render --json r.json  also write the structured report

It attaches to a server someone else is running and never starts or stops one,
because two things managing one dev server is its own bug.

  --url <url>        default http://localhost:$NUXT_PORT, else :3000; file:// works too
  --start            last resort: start a dev server if nothing answers
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
    autoStart: false,
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
    } else if (arg === '--start') {
      options.autoStart = true
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

async function click(cdp: Cdp, sessionId: string, selector: string): Promise<boolean> {
  return evaluate<boolean>(
    cdp,
    sessionId,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`,
  )
}

// The app binds its shortcuts on window, so a dispatched event drives them without a pointer.
async function press(cdp: Cdp, sessionId: string, key: string, meta = false): Promise<void> {
  await evaluate(
    cdp,
    sessionId,
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, metaKey: ${meta}, bubbles: true }))`,
  )
}

// Comment mode listens in the capture phase on document, which a bubbling event still reaches.
async function pickCommentTarget(cdp: Cdp, sessionId: string): Promise<boolean> {
  return evaluate<boolean>(
    cdp,
    sessionId,
    `(() => {
      const el = document.querySelector('[data-cmt]')
      if (!el) return false
      const box = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, clientX: box.left + 4, clientY: box.top + 4,
      }))
      return true
    })()`,
  )
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
  artifacts?: string[]
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

// a blank frame has three causes with three owners; fetching the src separates them,
// since an error response carries x-frame-options and the browser then renders nothing
async function diagnoseFrames(pageUrl: string, result: ProbeResult): Promise<void> {
  for (const region of result.regions) {
    const frame = region.frame
    if (!frame?.present || !frame.src) continue
    const url = ((): string | undefined => {
      try {
        return new URL(frame.src, pageUrl).href
      } catch {
        return undefined
      }
    })()
    if (!url?.startsWith('http')) continue
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const xfo = (response.headers.get('x-frame-options') ?? '').trim().toUpperCase()
      const csp = response.headers.get('content-security-policy') ?? ''
      frame.srcCheck = {
        url,
        reachable: true,
        status: response.status,
        framingBlocked: xfo === 'DENY' || /frame-ancestors\s+'none'/i.test(csp),
      }
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      const cause = error instanceof Error && error.cause ? ` (${String(error.cause)})` : ''
      frame.srcCheck = { url, reachable: false, status: 0, framingBlocked: false, reason: `${reason}${cause}` }
    }
  }
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
  let lastSettled = false
  let landing: ProbeResult | undefined

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

    const look = async (): Promise<ProbeResult> => {
      const settled = await waitForSettle(cdp, sessionId, options.settleMs)
      const result = await probe(cdp, sessionId, probeInput)
      await diagnoseFrames(options.url, result)
      lastSettled = settled
      return result
    }
    const keep = (state: ScreenState, result: ProbeResult): void => {
      states.push({ state, reached: true, settled: lastSettled, probe: result })
    }
    const skip = (state: ScreenState, why: string): void => {
      states.push({ state, reached: false, settled: false, skipped: why })
    }

    await cdp.send('Page.navigate', { url: options.url }, sessionId, 60_000)
    let seen = await look()
    landing = seen

    if (seen.screen.onDesk) keep('desk', seen)
    else skip('desk', `${options.url} does not render the desk, so that screen was never on show`)

    // Clicking a card is how a person opens a conversation, so it is how the check does.
    if (!seen.screen.face && seen.screen.deskCards > 0) {
      if (await click(cdp, sessionId, '[data-region="desk-card"]')) seen = await look()
    }
    // Artifacts first: the read face has nothing to render without one, and a run that
    // opened the wrong conversation would report that as a broken artifact frame.
    const key = (
      sessions.find((s) => s.live && s.key && s.artifacts?.length) ??
      sessions.find((s) => s.key && s.artifacts?.length) ??
      sessions.find((s) => s.live && s.key) ??
      sessions.find((s) => s.key)
    )?.key
    if (!seen.screen.face && !isFile && key) {
      await cdp.send('Page.navigate', { url: new URL(`/c/${key}`, options.url).href }, sessionId, 60_000)
      seen = await look()
    }

    const inConversation = Boolean(seen.screen.face)
    const openedKey = /\/c\/([^/?#]+)/.exec(seen.url)?.[1]
    const opened = sessions.find((s) => s.key === openedKey)
    const offered = seen.screen.faces.length
      ? seen.screen.faces
      : seen.screen.face
        ? [seen.screen.face]
        : []

    for (const face of FACES) {
      if (!inConversation) {
        skip(face, 'no conversation could be opened: no desk card to click and no session key to navigate to')
        continue
      }
      if (!offered.includes(face)) {
        skip(face, `the switcher does not offer ${face}, so that domain is not built and the face is unreachable`)
        continue
      }
      if (face === 'read' && opened && !opened.artifacts?.length) {
        skip('read', `${opened.name ?? openedKey ?? 'that conversation'} has stamped no artifact, so the read face has nothing to show`)
        continue
      }
      if (seen.screen.face !== face) {
        if (!(await click(cdp, sessionId, `[data-region="view-switcher"] [data-value="${face}"]`))) {
          skip(face, `the switcher offers ${face} but carries no [data-value="${face}"] control to click`)
          continue
        }
        seen = await look()
      }
      keep(face, seen)
    }

    await press(cdp, sessionId, 'k', true)
    const jump = await look()
    if (jump.regions.find((r) => r.id === 'jump-palette')?.found) keep('jump', jump)
    else skip('jump', 'command-K raised no jump palette')
    await press(cdp, sessionId, 'Escape')

    if (inConversation && seen.screen.commentTargets > 0) {
      await press(cdp, sessionId, 'c')
      await pickCommentTarget(cdp, sessionId)
      const comment = await look()
      if (comment.regions.find((r) => r.id === 'comment-popover')?.found) keep('comment', comment)
      else skip('comment', 'holding C and picking a [data-cmt] element opened no comment popover')
      await press(cdp, sessionId, 'Escape')
      await press(cdp, sessionId, 'Escape')
    } else {
      skip(
        'comment',
        inConversation
          ? 'nothing on the conversation carries data-cmt, so there is nothing to comment on'
          : 'comment mode needs a conversation, and none could be opened',
      )
    }

    await cdp.send('Browser.close').catch(() => undefined)
    cdp.close()
  } finally {
    chrome.stop()
    server.stop()
  }

  const findings: Finding[] = Judge.events(events)
  for (const state of states) {
    if (state.probe) findings.push(...Judge.state(state.state, state.probe))
  }
  if (landing && !states.some((state) => state.probe === landing)) {
    findings.push(...Judge.page(landing))
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
