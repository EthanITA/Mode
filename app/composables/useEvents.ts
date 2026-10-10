import type { SidecarEvent, Topic } from "~~/shared/types/events";

export interface Events {
  on: <T extends Topic>(topic: T, handler: (event: SidecarEvent<T>) => void) => void;
}

type Handler = (event: SidecarEvent) => void;

const RETRY_MS = 2000;

// One stream for the whole app, open while any handler listens.
const handlers = new Map<Topic, Set<Handler>>();
let source: EventSource | undefined;
let since: string | undefined;
let retry = 0;

function deliver(message: MessageEvent<string>): void {
  since = message.lastEventId || since;
  const event = JSON.parse(message.data) as SidecarEvent;
  for (const handler of handlers.get(event.topic) ?? []) handler(event);
}

function connect(): void {
  source = new EventSource(since ? `/api/events/stream?since=${since}` : "/api/events/stream");
  source.addEventListener("ready", (message: MessageEvent<string>) => (since = message.lastEventId || since));
  for (const topic of handlers.keys()) source.addEventListener(topic, deliver);
  // A restarting server can answer with its loading page, which closes an EventSource for good.
  source.addEventListener("error", () => {
    if (source?.readyState === EventSource.CLOSED) retry = window.setTimeout(connect, RETRY_MS);
  });
}

function off(topic: Topic, handler: Handler): void {
  const own = handlers.get(topic);
  own?.delete(handler);
  if (!own?.size) {
    handlers.delete(topic);
    source?.removeEventListener(topic, deliver);
  }
  if (handlers.size) return;
  window.clearTimeout(retry);
  source?.close();
  source = undefined;
}

export function useEvents(): Events {
  return {
    on: (topic, handler) => {
      const own = handler as Handler;
      const isFirst = !handlers.has(topic);
      handlers.set(topic, (handlers.get(topic) ?? new Set()).add(own));
      if (!source) connect();
      else if (isFirst) source.addEventListener(topic, deliver);
      onScopeDispose(() => off(topic, own));
    },
  };
}
