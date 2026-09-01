export type ScreenState = 'open' | 'closed'

export type RegionDemand = 'required' | 'empty-ok' | 'inert'

export interface RegionSpec {
  id: string
  label: string
  design: string
  selectors: string[]
  demand: RegionDemand
  states: ScreenState[]
  namesNotIds?: boolean
  frame?: boolean
}

export interface FrameReading {
  present: boolean
  src?: string
  reachable: boolean
  readyState?: string
  docTitle?: string
  htmlBytes: number
  bodyTextLength: number
  headings: string[]
  blank: boolean
  blockedReason?: string
}

export interface RegionReading {
  id: string
  found: boolean
  matched?: string
  visible: boolean
  textLength: number
  text: string
  elementCount: number
  headings: string[]
  interactiveCount: number
  graphicCount: number
  placeholders: string[]
  idLeaks: string[]
  inertMarked: boolean
  frame?: FrameReading
}

export interface ProbeInput {
  regions: { id: string; selectors: string[]; frame?: boolean }[]
  knownIds: string[]
  expectedNames: string[]
  placeholderPatterns: string[]
}

export interface OutlineNode {
  depth: number
  tag: string
  region?: string
  className?: string
  textLength: number
  snippet: string
}

export interface ProbeResult {
  url: string
  title: string
  viewport: { width: number; height: number }
  bodyTextLength: number
  domElementCount: number
  regions: RegionReading[]
  pagePlaceholders: string[]
  outline: OutlineNode[]
  namesOnScreen: string[]
  namesMissing: string[]
  panelToggle: boolean
}

export type Severity = 'fail' | 'warn' | 'info'

export interface Finding {
  severity: Severity
  state: ScreenState | 'page'
  region?: string
  code: string
  detail: string
}

export interface PageEvent {
  kind: 'exception' | 'console-error' | 'request-failed'
  detail: string
}

export interface StateReport {
  state: ScreenState
  reached: boolean
  skipped?: string
  settled: boolean
  probe?: ProbeResult
}

export interface RenderReport {
  url: string
  startedAt: string
  viewport: { width: number; height: number }
  sessions: { id: string; key: string; name?: string; live: boolean }[]
  states: StateReport[]
  events: PageEvent[]
  findings: Finding[]
  verdict: 'pass' | 'fail'
}
