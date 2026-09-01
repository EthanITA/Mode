import { REGIONS } from './regions.ts'
import type {
  Finding,
  PageEvent,
  ProbeResult,
  RegionReading,
  RegionSpec,
  RenderReport,
  ScreenState,
  StateReport,
} from './types.ts'

export function hasSubstance(reading: RegionReading): boolean {
  if (reading.textLength > 0) return true
  if (reading.interactiveCount > 0) return true
  if (reading.graphicCount > 0) return true
  return Boolean(reading.frame?.reachable)
}

function judgeFrame(spec: RegionSpec, reading: RegionReading, state: ScreenState): Finding[] {
  const frame = reading.frame
  if (!frame) return []
  if (!frame.present) {
    return [{
      severity: 'fail',
      state,
      region: spec.id,
      code: 'frame-missing',
      detail: 'holds no iframe, so no artifact is being rendered here',
    }]
  }
  if (!frame.reachable) {
    return [{
      severity: 'fail',
      state,
      region: spec.id,
      code: 'frame-unreachable',
      detail: `iframe src=${frame.src ?? '(none)'} — ${frame.blockedReason ?? 'inner document unreadable'}`,
    }]
  }
  if (frame.blank) {
    return [{
      severity: 'fail',
      state,
      region: spec.id,
      code: 'frame-blank',
      detail: `iframe resolved but the document is empty: ${frame.htmlBytes} bytes of HTML, ${frame.bodyTextLength} chars of text, ${frame.headings.length} headings`,
    }]
  }
  return [{
    severity: 'info',
    state,
    region: spec.id,
    code: 'frame-rendered',
    detail: `${frame.htmlBytes.toLocaleString('en-US')} bytes, ${frame.bodyTextLength.toLocaleString('en-US')} chars, ${frame.headings.length} headings, title ${JSON.stringify(frame.docTitle ?? '')}`,
  }]
}

function judgeRegion(spec: RegionSpec, reading: RegionReading, state: ScreenState): Finding[] {
  const findings: Finding[] = []
  const at = { state, region: spec.id }

  if (!reading.found) {
    findings.push({
      ...at,
      severity: spec.demand === 'required' ? 'fail' : 'warn',
      code: 'region-missing',
      detail: `no element matched ${spec.selectors.join(' , ')} — the design says: ${spec.design}`,
    })
    return findings
  }

  if (!reading.visible) {
    findings.push({
      ...at,
      severity: spec.demand === 'required' ? 'fail' : 'warn',
      code: 'region-hidden',
      detail: 'element exists but has no visible box on screen',
    })
  }

  if (!hasSubstance(reading)) {
    findings.push({
      ...at,
      severity: spec.demand === 'required' ? 'fail' : 'warn',
      code: spec.demand === 'required' ? 'region-empty' : 'region-silent',
      detail:
        spec.demand === 'required'
          ? `renders nothing — no text, no controls, no graphics. The design says: ${spec.design}`
          : 'renders nothing at all — an empty state with no words is indistinguishable from a broken one',
    })
  }

  for (const placeholder of reading.placeholders) {
    findings.push({
      ...at,
      severity: spec.demand === 'inert' ? 'info' : 'fail',
      code: 'placeholder',
      detail: `renders the literal fallback string ${JSON.stringify(placeholder)} where real content belongs`,
    })
  }

  for (const leak of reading.idLeaks) {
    findings.push({
      ...at,
      severity: 'fail',
      code: 'id-leak',
      detail: `renders the session id ${JSON.stringify(leak)} as text where a name belongs`,
    })
  }

  if (spec.demand === 'inert' && !reading.inertMarked) {
    findings.push({
      ...at,
      severity: 'warn',
      code: 'inert-unmarked',
      detail: 'scaffolding for something that cannot work yet, carrying no data-not-real or disabled mark',
    })
  }

  findings.push(...judgeFrame(spec, reading, state))
  return findings
}

export function judgeState(state: ScreenState, probe: ProbeResult): Finding[] {
  const findings: Finding[] = []

  if (probe.bodyTextLength < 40) {
    findings.push({
      severity: 'fail',
      state,
      code: 'page-blank',
      detail: `the whole page carries ${probe.bodyTextLength} characters of visible text across ${probe.domElementCount} elements`,
    })
  }

  const claimed = new Set<string>()
  for (const spec of REGIONS) {
    if (!spec.states.includes(state)) continue
    const reading = probe.regions.find((r) => r.id === spec.id)
    if (!reading) continue
    for (const placeholder of reading.placeholders) claimed.add(placeholder)
    findings.push(...judgeRegion(spec, reading, state))
  }

  // the safety net: a fallback string fails the build even when no region matched it
  for (const placeholder of probe.pagePlaceholders) {
    if (claimed.has(placeholder)) continue
    findings.push({
      severity: 'fail',
      state,
      code: 'page-placeholder',
      detail: `the page renders the literal fallback string ${JSON.stringify(placeholder)}, outside any region the check could locate`,
    })
  }

  if (probe.namesMissing.length) {
    findings.push({
      severity: 'warn',
      state,
      region: 'session-tabs',
      code: 'name-absent',
      detail: `live sessions whose real name appears nowhere on screen: ${probe.namesMissing.map((n) => JSON.stringify(n)).join(', ')}`,
    })
  }

  return findings
}

export function judgeEvents(events: PageEvent[]): Finding[] {
  return events.map((event): Finding => {
    if (event.kind === 'exception') {
      return { severity: 'fail', state: 'page', code: 'page-exception', detail: event.detail }
    }
    if (event.kind === 'request-failed') {
      const critical = /\/api\/|\/artifact\//.test(event.detail)
      return {
        severity: critical ? 'fail' : 'warn',
        state: 'page',
        code: 'request-failed',
        detail: event.detail,
      }
    }
    return { severity: 'warn', state: 'page', code: 'console-error', detail: event.detail }
  })
}

function statusOf(spec: RegionSpec, reading: RegionReading): string {
  if (!reading.found) return 'MISSING'
  if (reading.placeholders.length && spec.demand !== 'inert') return 'FALLBACK'
  if (reading.idLeaks.length) return 'ID-LEAK'
  if (!reading.visible) return 'HIDDEN'
  if (!hasSubstance(reading)) return spec.demand === 'required' ? 'EMPTY' : 'SILENT'
  if (reading.frame && !reading.frame.reachable) return 'NO FRAME'
  if (reading.frame?.blank) return 'BLANK'
  if (spec.demand === 'inert') return 'INERT'
  return 'OK'
}

function summaryOf(reading: RegionReading): string {
  if (!reading.found) return '—'
  const frame = reading.frame
  if (frame?.reachable) {
    return `frame ${frame.htmlBytes.toLocaleString('en-US')}B · ${frame.headings.length} headings · ${JSON.stringify(frame.docTitle ?? '')}`
  }
  if (frame?.present) return `frame present, unreadable (src ${frame.src ?? 'none'})`
  if (reading.headings.length) {
    const first = reading.headings[0] ?? ''
    return `${reading.headings.length} headings, first ${JSON.stringify(first.slice(0, 44))}`
  }
  if (reading.textLength) return JSON.stringify(reading.text.slice(0, 66))
  if (reading.interactiveCount || reading.graphicCount) {
    return `${reading.interactiveCount} controls, ${reading.graphicCount} graphics, no text`
  }
  return '(nothing)'
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length)
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value
}

function renderStateTable(report: StateReport): string[] {
  const lines: string[] = []
  const title = report.state === 'open' ? 'STATE A · conversation panel open' : 'STATE B · page alone'
  lines.push('')
  lines.push(title)

  if (!report.reached) {
    lines.push(`  not reached — ${report.skipped ?? 'unknown reason'}`)
    return lines
  }

  const probe = report.probe
  if (!probe) return lines

  lines.push(
    `  ${probe.domElementCount.toLocaleString('en-US')} elements, ${probe.bodyTextLength.toLocaleString('en-US')} chars of visible text${report.settled ? '' : ', DOM NEVER SETTLED'}`,
  )
  lines.push('')
  lines.push(
    `  ${pad('REGION', 20)}${pad('STATUS', 10)}${padStart('CHARS', 6)}${padStart('ELEMS', 7)}  WHAT IS THERE`,
  )

  let missing = 0
  for (const spec of REGIONS) {
    if (!spec.states.includes(report.state)) continue
    const reading = probe.regions.find((r) => r.id === spec.id)
    if (!reading) continue
    if (!reading.found) missing++
    lines.push(
      `  ${pad(spec.label, 20)}${pad(statusOf(spec, reading), 10)}${padStart(reading.found ? String(reading.textLength) : '-', 6)}${padStart(reading.found ? String(reading.elementCount) : '-', 7)}  ${summaryOf(reading)}`,
    )
  }

  if (missing) {
    lines.push('')
    lines.push(`  ${missing} region(s) were not found. What the page does contain:`)
    for (const node of probe.outline) {
      const tag = node.region ? `${node.tag}[data-region="${node.region}"]` : node.tag
      const named = node.className ? `${tag}.${node.className.split(/\s+/).join('.')}` : tag
      lines.push(`    ${'  '.repeat(node.depth)}${named}  ${node.snippet ? JSON.stringify(node.snippet) : '(no text)'}`)
    }
  }
  return lines
}

export function renderReport(report: RenderReport): string {
  const lines: string[] = []
  lines.push('MODE SIDECAR · RENDER CHECK')
  lines.push(`  url        ${report.url}`)
  lines.push(`  viewport   ${report.viewport.width}x${report.viewport.height}`)
  lines.push(
    `  sessions   ${report.sessions.length} from /api/sessions, ${report.sessions.filter((s) => s.live).length} live, ${report.sessions.filter((s) => s.name).length} named`,
  )

  for (const state of report.states) lines.push(...renderStateTable(state))

  const fails = report.findings.filter((f) => f.severity === 'fail')
  const warns = report.findings.filter((f) => f.severity === 'warn')

  if (fails.length) {
    lines.push('')
    lines.push(`FAILURES (${fails.length})`)
    for (const finding of fails) {
      lines.push(`  ✗ [${finding.state}] ${finding.region ?? 'page'} · ${finding.code}`)
      lines.push(`      ${finding.detail}`)
    }
  }

  if (warns.length) {
    lines.push('')
    lines.push(`WARNINGS (${warns.length})`)
    for (const finding of warns) {
      lines.push(`  ! [${finding.state}] ${finding.region ?? 'page'} · ${finding.code}`)
      lines.push(`      ${finding.detail}`)
    }
  }

  const regionFails = new Set(fails.filter((f) => f.region).map((f) => `${f.state}:${f.region ?? ''}`)).size
  const pageFails = fails.length - fails.filter((f) => f.region).length

  lines.push('')
  lines.push(
    report.verdict === 'pass'
      ? `PASS — every region the design fills has content on screen. ${warns.length} warning(s).`
      : `FAIL — ${regionFails} region(s) not showing what the design says they hold, ${pageFails} page-level error(s).`,
  )
  lines.push('  This check reports structure and presence only. Whether it looks right is Marco’s call.')
  return lines.join('\n')
}
