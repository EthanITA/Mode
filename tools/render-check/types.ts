// v6 is two routes and three faces, so a screen is where you are rather than
// whether one panel is collapsed.
export type ScreenState = 'desk' | 'canvas' | 'read' | 'history' | 'jump' | 'comment'

export type RegionDemand = 'required' | 'empty-ok' | 'inert'

export interface RegionSpec {
  id: string
  label: string
  design: string
  selectors: string[]
  demand: RegionDemand
  states: ScreenState[]
  /** Renders a session id as a leak rather than as content. */
  namesNotIds?: boolean
  /** Renders words a person or Claude wrote, where a fallback string is content rather than a defect. */
  quotes?: boolean
  frame?: boolean
}

export interface FrameSrcCheck {
  url: string
  reachable: boolean
  status: number
  framingBlocked: boolean
  reason?: string
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
  srcCheck?: FrameSrcCheck
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
  screen: ScreenReading
}

export interface ScreenReading {
  commentTargets: number
  deskCards: number
  /** The face the conversation stage is showing, absent when no conversation is mounted. */
  face?: string
  /** What the switcher offers, empty when fewer than two domains are built. */
  faces: string[]
  onDesk: boolean
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
