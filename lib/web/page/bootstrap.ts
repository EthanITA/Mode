{
  const given = new URL(document.currentScript?.getAttribute("src") ?? "", location.href).searchParams.get("upstream");
  const upstream = given ? new URL(given) : undefined;
  const WEB: Record<string, string> = { "ws:": "http:", "wss:": "https:" };

  const mapped = (raw: string | URL): string | URL => {
    if (!upstream) return raw;
    let url: URL;
    try {
      url = new URL(String(raw), location.href);
    } catch {
      return raw;
    }
    const socket = url.protocol in WEB;
    if ((WEB[url.protocol] ?? url.protocol) !== upstream.protocol || url.host !== upstream.host) return raw;
    url.protocol = socket ? (location.protocol === "https:" ? "wss:" : "ws:") : location.protocol;
    url.host = location.host;
    return url.href;
  };

  const fetchNative = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!(input instanceof Request)) return fetchNative(mapped(input), init);
    const url = mapped(input.url);
    return fetchNative(url === input.url ? input : new Request(url, input), init);
  };

  // Arity matters: open(method, url, undefined) is a synchronous request, so the arguments pass through as given.
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]): void {
    if (args.length > 1) args[1] = mapped(args[1] as string | URL);
    Reflect.apply(open, this, args);
  } as typeof open;

  for (const name of ["WebSocket", "EventSource"] as const) {
    const Native = window[name];
    window[name] = new Proxy(Native, {
      construct: (target, args: unknown[]) => {
        if (args.length) args[0] = mapped(args[0] as string | URL);
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
}
