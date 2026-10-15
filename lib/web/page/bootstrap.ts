{
  const script = new URL(document.currentScript?.getAttribute("src") ?? "", location.href).searchParams;
  const base = script.get("base") ?? "";
  const SOCKET: Record<string, string> = { "ws:": "http:", "wss:": "https:" };
  const head = base && location.hostname.endsWith(`.${base}`) ? location.hostname.slice(0, -base.length - 1) : "";
  const host = head.slice(0, head.lastIndexOf("."));
  const tail = location.hostname.slice(host.length);
  // The proxy is plain http, so an address that borrows the page's scheme takes the site's own instead.
  const scheme = head.slice(host.length + 1).replace(/-\d+$/, "") || location.protocol.slice(0, -1);

  // WebHost.proxied's twin, since a classic script that runs before the page's own can't import it.
  const proxied = (raw: string | URL): string | URL => {
    if (!base) return raw;
    let url: URL;
    try {
      url = new URL(
        String(raw),
        String(raw).startsWith("//") ? `${scheme}://${host || location.host}/` : location.href,
      );
    } catch {
      return raw;
    }
    const web = SOCKET[url.protocol] ?? url.protocol;
    if (web !== "http:" && web !== "https:") return raw;
    const name = url.hostname === "[::1]" ? "localhost" : url.hostname;
    if (name.startsWith("[") || name.endsWith(`.${base}`)) return raw;
    const label = `${web.slice(0, -1)}${url.port ? `-${url.port}` : ""}`;
    const to = url.protocol in SOCKET ? "ws" : "http";
    return `${to}://${name}.${label}.${base}:${location.port}${url.pathname}${url.search}${url.hash}`;
  };

  const fetchNative = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!(input instanceof Request)) return fetchNative(proxied(input), init);
    const url = proxied(input.url);
    return fetchNative(url === input.url ? input : new Request(url, input), init);
  };

  // Arity matters: open(method, url, undefined) is a synchronous request, so the arguments pass through as given.
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]): void {
    if (args.length > 1) args[1] = proxied(args[1] as string | URL);
    Reflect.apply(open, this, args);
  } as typeof open;

  for (const name of ["WebSocket", "EventSource"] as const) {
    const Native = window[name];
    window[name] = new Proxy(Native, {
      construct: (target, args: unknown[]) => {
        if (args.length) args[0] = proxied(args[0] as string | URL);
        return Reflect.construct(target, args) as object;
      },
    }) as never;
  }

  const beacon = window.navigator?.sendBeacon?.bind(window.navigator);
  if (beacon) window.navigator.sendBeacon = (url: string | URL, data?: BodyInit) => beacon(proxied(url), data);
  const popup = window.open?.bind(window);
  if (popup)
    window.open = (url?: string | URL, target?: string, features?: string) =>
      popup(url && proxied(url), target, features);

  // Bundlers add their chunks and preloads by setting src or href, which would load them past the proxy.
  const kinds = window as unknown as Record<string, { prototype: object } | undefined>;
  for (const [kind, name] of [
    ["HTMLScriptElement", "src"],
    ["HTMLLinkElement", "href"],
    ["HTMLIFrameElement", "src"],
  ] as const) {
    const proto = kinds[kind]?.prototype;
    const held = proto && Object.getOwnPropertyDescriptor(proto, name);
    const set = held?.set;
    if (proto && held && set)
      Object.defineProperty(proto, name, {
        ...held,
        set(this: object, value: unknown): void {
          set.call(this, String(proxied(String(value))));
        },
      });
  }
  const isMoved = (el: Element, name: string): boolean =>
    (name === "src" && /^(SCRIPT|IFRAME)$/.test(el.tagName)) || (name === "href" && el.tagName === "LINK");
  const setAttribute = window.Element?.prototype.setAttribute;
  if (setAttribute)
    window.Element.prototype.setAttribute = function (this: Element, name: string, value: string): void {
      setAttribute.call(this, name, isMoved(this, name.toLowerCase()) ? String(proxied(value)) : value);
    };

  // Read off the attribute, since form.action is shadowed by any field named "action".
  const aim = (el: Element | undefined, name: string): void => {
    const raw = el?.getAttribute(name);
    const to = raw && String(proxied(raw));
    if (to && to !== raw) el?.setAttribute(name, to);
  };
  // A new tab or the window above would take the page out of the sidecar.
  const stay = (el: Element | undefined, name: string): void => {
    if (/^_(blank|parent|top)$/i.test(el?.getAttribute(name) ?? "")) el?.setAttribute(name, "_self");
  };

  const keep = (event: Event): void => {
    const target = event.target as Element | undefined;
    const link = target?.closest?.("a[href]") as HTMLAnchorElement | undefined;
    if (link && proxied(link.href) !== link.href) link.href = String(proxied(link.href));
    if (event.type !== "submit") return;
    const submitter = (event as SubmitEvent).submitter ?? undefined;
    aim(target, "action");
    aim(submitter, "formaction");
    stay(target, "target");
    stay(submitter, "formtarget");
  };
  window.addEventListener("click", keep, true);
  window.addEventListener("submit", keep, true);

  // form.submit() fires no submit event, and it is how scripted forms such as Google's consent post.
  const submit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function (this: HTMLFormElement): void {
    aim(this, "action");
    stay(this, "target");
    submit.call(this);
  };

  // A script that sets location to another site would leave the proxy, and most sites refuse to be framed.
  window.navigation?.addEventListener("navigate", (event) => {
    if (!event.cancelable || event.formData || typeof event.downloadRequest === "string") return;
    const to = proxied(event.destination.url);
    if (to === event.destination.url) return;
    event.preventDefault();
    if (event.navigationType === "replace") location.replace(String(to));
    else location.assign(String(to));
  });

  // The proxy makes the site's own session cookies last and scopes its domain to the artifact, and these are the ones its scripts set.
  const cookieOf = (text: string): string => {
    const domain = /;\s*domain\s*=\s*\.?([^;]*)/i.exec(text)?.[1]?.trim().toLowerCase();
    const own = text.replace(/;\s*domain\s*=[^;]*/gi, "");
    const lasting = /;\s*(expires|max-age)\s*=/i.test(own) ? own : `${own}; max-age=34560000`;
    const isOwn = !!domain && !!host && (host === domain || host.endsWith(`.${domain}`));
    return isOwn ? `${lasting}; domain=${domain}${tail}` : lasting;
  };
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
        write.call(this, cookieOf(String(value)));
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
