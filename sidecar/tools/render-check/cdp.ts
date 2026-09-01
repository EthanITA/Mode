type Params = Record<string, unknown>

interface Envelope {
  id?: number
  method?: string
  params?: Params
  result?: unknown
  error?: { message?: string }
  sessionId?: string
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export type CdpHandler = (params: Params) => void

export class Cdp {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly handlers = new Map<string, CdpHandler[]>()

  private readonly socket: WebSocket

  // node's strip-only TypeScript rejects parameter properties, so the field is declared by hand
  private constructor(socket: WebSocket) {
    this.socket = socket
    socket.addEventListener('message', (event: MessageEvent) => this.receive(String(event.data)))
  }

  static connect(wsUrl: string, timeoutMs: number): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timer = setTimeout(() => reject(new Error(`CDP did not connect within ${timeoutMs}ms`)), timeoutMs)
      socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolve(new Cdp(socket))
      })
      socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error(`CDP socket failed to open at ${wsUrl}`))
      })
    })
  }

  send<T>(method: string, params: Params = {}, sessionId?: string, timeoutMs = 30_000): Promise<T> {
    const id = this.nextId++
    const payload: Envelope = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      this.socket.send(JSON.stringify(payload))
    })
  }

  on(method: string, handler: CdpHandler): void {
    const existing = this.handlers.get(method)
    if (existing) existing.push(handler)
    else this.handlers.set(method, [handler])
  }

  close(): void {
    for (const pending of this.pending.values()) clearTimeout(pending.timer)
    this.pending.clear()
    try {
      this.socket.close()
    } catch {
      // a socket already torn down by Browser.close is the normal exit path
    }
  }

  private receive(raw: string): void {
    const message = JSON.parse(raw) as Envelope
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'))
      else pending.resolve(message.result)
      return
    }
    if (!message.method) return
    for (const handler of this.handlers.get(message.method) ?? []) handler(message.params ?? {})
  }
}
