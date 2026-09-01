import type { FrameReading, OutlineNode, ProbeInput, ProbeResult, RegionReading } from './types.ts'

/**
 * Serialised with `.toString()` and evaluated inside the page, so it may not
 * reference anything outside its own body — everything arrives via `input`.
 */
export function probeScreen(input: ProbeInput): ProbeResult {
  const flatten = (s: string): string => s.replace(/\s+/g, ' ').trim()

  const readText = (el: Element): string => {
    const rendered = (el as HTMLElement).innerText
    return flatten(rendered || el.textContent || '')
  }

  const CONTROLS = 'input,textarea,select'
  const INTERACTIVE = 'button,a[href],input,select,textarea,[role="button"],[role="tab"]'

  // innerText ignores form controls, so their placeholder and value are collected by hand
  const controlText = (el: Element): string => {
    const parts: string[] = []
    const take = (node: Element): void => {
      if (!node.matches(CONTROLS)) return
      const field = node as HTMLInputElement
      if (field.placeholder) parts.push(field.placeholder)
      if (field.value) parts.push(field.value)
    }
    take(el)
    for (const node of Array.from(el.querySelectorAll(CONTROLS))) take(node)
    return parts.join(' ')
  }

  const isVisible = (el: Element): boolean => {
    if (!el.getClientRects().length) return false
    const style = getComputedStyle(el)
    return style.visibility !== 'hidden' && Number(style.opacity) > 0.01
  }

  const INERT_MARK = '[data-not-real],[data-inert],[data-scaffold],[aria-disabled="true"],[disabled]'
  const INERT_WORDS = /not real|scaffold|phase 4|not wired|no version store|inert|placeholder for/i

  const isInertMarked = (el: Element, text: string): boolean => {
    if (el.matches(INERT_MARK)) return true
    if (el.querySelector(INERT_MARK)) return true
    return INERT_WORDS.test(text)
  }

  const readFrame = (host: Element): FrameReading => {
    const frame = host.matches('iframe')
      ? (host as HTMLIFrameElement)
      : host.querySelector('iframe')
    if (!frame) return { present: false, reachable: false, htmlBytes: 0, bodyTextLength: 0, headings: [], blank: true }

    const src = (frame as HTMLIFrameElement).getAttribute('src') || undefined
    const opened = ((): { doc?: Document; blockedReason?: string } => {
      try {
        // external contract: the DOM defines contentDocument as Document | null
        const found = (frame as HTMLIFrameElement).contentDocument ?? undefined
        if (!found) return { blockedReason: 'contentDocument is empty — the frame never loaded a document' }
        return { doc: found }
      } catch (err) {
        return { blockedReason: `contentDocument threw: ${String(err)}` }
      }
    })()
    const doc = opened.doc
    if (!doc) {
      return { present: true, src, reachable: false, htmlBytes: 0, bodyTextLength: 0, headings: [], blank: true, blockedReason: opened.blockedReason }
    }

    const html = doc.documentElement ? doc.documentElement.outerHTML : ''
    const bodyText = doc.body ? flatten(doc.body.innerText || doc.body.textContent || '') : ''
    const headings = Array.from(doc.querySelectorAll('h1,h2,h3'))
      .slice(0, 12)
      .map((h) => flatten(h.textContent || ''))
      .filter((h) => h.length > 0)

    return {
      present: true,
      src,
      reachable: true,
      readyState: doc.readyState,
      docTitle: doc.title || undefined,
      htmlBytes: html.length,
      bodyTextLength: bodyText.length,
      headings,
      blank: bodyText.length < 40 && !headings.length,
    }
  }

  const patterns = input.placeholderPatterns.map((p) => new RegExp(p, 'gi'))

  const findPlaceholders = (text: string): string[] => {
    const hits: string[] = []
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      const matches = text.match(pattern)
      if (matches) for (const match of matches) if (!hits.includes(match)) hits.push(match)
    }
    return hits
  }

  const readRegion = (spec: { id: string; selectors: string[]; frame?: boolean }): RegionReading => {
    const found = ((): { el?: Element; matched?: string } => {
      for (const selector of spec.selectors) {
        const hit = document.querySelector(selector)
        if (hit) return { el: hit, matched: selector }
      }
      return {}
    })()
    const el = found.el
    const matched = found.matched
    if (!el) {
      return {
        id: spec.id,
        found: false,
        visible: false,
        textLength: 0,
        text: '',
        elementCount: 0,
        headings: [],
        interactiveCount: 0,
        graphicCount: 0,
        placeholders: [],
        idLeaks: [],
        inertMarked: false,
      }
    }

    const text = flatten(`${readText(el)} ${controlText(el)}`)
    const placeholders = findPlaceholders(text)
    const lower = text.toLowerCase()
    const idLeaks = input.knownIds.filter((id) => id.length >= 8 && lower.includes(id.toLowerCase()))

    return {
      id: spec.id,
      found: true,
      matched,
      visible: isVisible(el),
      textLength: text.length,
      text: text.slice(0, 400),
      elementCount: el.querySelectorAll('*').length,
      headings: Array.from(el.querySelectorAll('h1,h2,h3,h4'))
        .slice(0, 12)
        .map((h) => flatten(h.textContent || ''))
        .filter((h) => h.length > 0),
      interactiveCount: el.querySelectorAll(INTERACTIVE).length + (el.matches(INTERACTIVE) ? 1 : 0),
      graphicCount: el.querySelectorAll('img,svg,canvas,video,picture').length,
      placeholders,
      idLeaks,
      inertMarked: isInertMarked(el, text),
      frame: spec.frame ? readFrame(el) : undefined,
    }
  }

  const outline: OutlineNode[] = []
  const walk = (parent: Element, depth: number): void => {
    if (depth > 3 || outline.length >= 40) return
    for (const child of Array.from(parent.children)) {
      if (outline.length >= 40) return
      if (child.matches('script,style,link,meta,noscript')) continue
      const text = readText(child)
      outline.push({
        depth,
        tag: child.tagName.toLowerCase(),
        region: child.getAttribute('data-region') ?? undefined,
        className: typeof child.className === 'string' && child.className ? child.className : undefined,
        textLength: text.length,
        snippet: text.slice(0, 70),
      })
      walk(child, depth + 1)
    }
  }
  if (document.body) walk(document.body, 0)

  const bodyText = document.body ? flatten(document.body.innerText || document.body.textContent || '') : ''
  const namesOnScreen = input.expectedNames.filter((n) => n.length > 0 && bodyText.includes(n))
  const namesMissing = input.expectedNames.filter((n) => n.length > 0 && !bodyText.includes(n))

  return {
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    bodyTextLength: bodyText.length,
    domElementCount: document.querySelectorAll('*').length,
    regions: input.regions.map(readRegion),
    pagePlaceholders: findPlaceholders(bodyText),
    outline,
    namesOnScreen,
    namesMissing,
    panelToggle: Boolean(
      document.querySelector('[data-region-toggle="panel"],[data-panel-toggle]'),
    ),
  }
}
