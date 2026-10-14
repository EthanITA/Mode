{
  const script = new URL(document.currentScript?.getAttribute("src") ?? "", location.href).searchParams;
  const given = script.get("upstream");
  const upstream = given ? new URL(given) : undefined;
  const site = script.get("site") ?? "";
  const WEB: Record<string, string> = { "ws:": "http:", "wss:": "https:" };

  // Only calls take the sibling route, since a page loaded through it would resolve its links against the wrong host.
  const mapped = (raw: string | URL, { siblings = false } = {}): string | URL => {
    if (!upstream) return raw;
    let url: URL;
    try {
      url = new URL(String(raw), location.href);
    } catch {
      return raw;
    }
    const socket = url.protocol in WEB;
    if ((WEB[url.protocol] ?? url.protocol) !== upstream.protocol) return raw;
    if (url.host !== upstream.host) {
      const isSibling = !!site && (url.hostname === site || url.hostname.endsWith(`.${site}`));
      return siblings && isSibling && !socket
        ? `${location.origin}/__sidecar/via/${url.host}${url.pathname}${url.search}${url.hash}`
        : raw;
    }
    url.protocol = socket ? (location.protocol === "https:" ? "wss:" : "ws:") : location.protocol;
    url.host = location.host;
    return url.href;
  };
  const CALL = { siblings: true };

  const fetchNative = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!(input instanceof Request)) return fetchNative(mapped(input, CALL), init);
    const url = mapped(input.url, CALL);
    return fetchNative(url === input.url ? input : new Request(url, input), init);
  };

  // Arity matters: open(method, url, undefined) is a synchronous request, so the arguments pass through as given.
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]): void {
    if (args.length > 1) args[1] = mapped(args[1] as string | URL, CALL);
    Reflect.apply(open, this, args);
  } as typeof open;

  for (const name of ["WebSocket", "EventSource"] as const) {
    const Native = window[name];
    window[name] = new Proxy(Native, {
      construct: (target, args: unknown[]) => {
        if (args.length) args[0] = mapped(args[0] as string | URL, CALL);
        return Reflect.construct(target, args) as object;
      },
    }) as never;
  }

  // An absolute link or form aimed at the site itself would leave the proxy, and the comment layer with it.
  const keep = (event: Event): void => {
    const target = event.target as Element | undefined;
    const link = target?.closest?.("a[href]") as HTMLAnchorElement | undefined;
    if (link && mapped(link.href) !== link.href) link.href = String(mapped(link.href));
    const form = event.type === "submit" ? (target as HTMLFormElement | undefined) : undefined;
    if (form?.action && mapped(form.action) !== form.action) form.action = String(mapped(form.action));
  };
  window.addEventListener("click", keep, true);
  window.addEventListener("submit", keep, true);

  // The proxy makes the site's own session cookies last, and these are the ones its scripts set.
  const jar = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  const { get: read, set: write } = jar ?? {};
  if (read && write)
    Object.defineProperty(Document.prototype, "cookie", {
      configurable: true,
      enumerable: true,
      get(this: Document): string {
        return read.call(this) as string;
      },
      set(this: Document, value: unknown): void {
        const text = String(value);
        write.call(this, /;\s*(expires|max-age)\s*=/i.test(text) ? text : `${text}; max-age=34560000`);
      },
    });

  // sessionStorage ends with the tab, so a site that keeps its sign-in there gets it back from a copy in localStorage.
  const COPY = "__sidecar:session";
  let queued = false;
  const save = (): void => {
    queued = false;
    const all: Record<string, string> = {};
    for (let at = 0; at < sessionStorage.length; at += 1) {
      const name = sessionStorage.key(at);
      if (typeof name === "string") all[name] = sessionStorage.getItem(name) ?? "";
    }
    localStorage.setItem(COPY, JSON.stringify(all));
  };
  try {
    const held = JSON.parse(localStorage.getItem(COPY) ?? "{}") as Record<string, string>;
    if (!sessionStorage.length) for (const [name, value] of Object.entries(held)) sessionStorage.setItem(name, value);
    for (const method of ["setItem", "removeItem", "clear"] as const) {
      const native = Storage.prototype[method] as (...args: unknown[]) => unknown;
      (Storage.prototype as unknown as Record<string, unknown>)[method] = function (this: Storage, ...args: unknown[]) {
        const out = Reflect.apply(native, this, args);
        if (this === sessionStorage && !queued) {
          queued = true;
          queueMicrotask(save);
        }
        return out;
      };
    }
    window.addEventListener("pagehide", save);
  } catch {
    // storage turned off for the site leaves its sessionStorage as the browser keeps it
  }
}
