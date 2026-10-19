{
  const script = new URL(document.currentScript?.getAttribute("src") ?? "", location.href).searchParams;
  const base = script.get("base") ?? "";
  const frame = script.get("frame") ?? "";
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

  const siteOf = (origin: string): string => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return origin;
    }
    if (!base || !url.hostname.endsWith(`.${base}`)) return origin;
    const at = url.hostname.slice(0, -base.length - 1);
    const cut = at.lastIndexOf(".");
    const [, web, port] = /^(https?)(?:-(\d+))?$/.exec(at.slice(cut + 1)) ?? [];
    return cut > 0 && web ? `${web}://${at.slice(0, cut)}${port ? `:${port}` : ""}` : origin;
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

  // Pages trust their popup, opener and framing site by the sites' own origins, as Google's sign-in and claude.ai's artifacts do.
  const aimed = (to: unknown): unknown => {
    if (typeof to === "string") return to === "*" || to === "/" ? to : String(proxied(to));
    return to && typeof to === "object" && "targetOrigin" in to
      ? { ...to, targetOrigin: aimed((to as WindowPostMessageOptions).targetOrigin) }
      : to;
  };
  const views = new WeakMap<object, Window>();
  const view = (raw: Window): Window => {
    const held = views.get(raw);
    if (held) return held;
    const post = (...args: unknown[]): void => {
      if (args.length > 1) args[1] = aimed(args[1]);
      Reflect.apply(raw.postMessage, raw, args);
    };
    const shown = new Proxy(raw, {
      get: (into, name) => {
        if (name === "postMessage") return post;
        const value = Reflect.get(into, name) as unknown;
        return typeof value === "function" ? value.bind(into) : value;
      },
    });
    views.set(raw, shown);
    return shown;
  };
  const seen = (name: "opener" | "parent", raw: Window): void => {
    let shown: unknown = view(raw);
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get: () => shown,
      set: (value: unknown) => (shown = value),
    });
  };
  if (window.opener) seen("opener", window.opener as Window);
  const above = window.location.ancestorOrigins?.[0];
  if (above && above !== location.origin && siteOf(above) !== above) seen("parent", window.parent);

  const popup = window.open?.bind(window);
  if (popup)
    window.open = (url?: string | URL, target?: string, features?: string) => {
      const opened = popup(url && proxied(url), target, features);
      return opened && view(opened);
    };
  const told = window.MessageEvent && Object.getOwnPropertyDescriptor(MessageEvent.prototype, "origin")?.get;
  const from = window.MessageEvent && Object.getOwnPropertyDescriptor(MessageEvent.prototype, "source")?.get;
  if (told && from)
    Object.defineProperties(MessageEvent.prototype, {
      origin: {
        configurable: true,
        enumerable: true,
        get(this: MessageEvent): string {
          const origin = told.call(this) as string;
          return views.has(from.call(this) as object) ? siteOf(origin) : origin;
        },
      },
      source: {
        configurable: true,
        enumerable: true,
        get(this: MessageEvent): MessageEvent["source"] {
          const source = from.call(this) as MessageEvent["source"];
          return (source && views.get(source)) ?? source;
        },
      },
    });

  const setAttribute = window.Element?.prototype.setAttribute;
  // Chrome sends a frame's csp as Sec-Required-CSP, which is how the proxy tells a site's frame from the sidecar's.
  const mark = (el: Element): void => {
    if (frame && setAttribute && el.tagName === "IFRAME" && !el.hasAttribute("csp"))
      setAttribute.call(el, "csp", frame);
  };

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
        set(this: Element, value: unknown): void {
          mark(this);
          set.call(this, String(proxied(String(value))));
        },
      });
  }
  const isMoved = (el: Element, name: string): boolean =>
    (name === "src" && /^(SCRIPT|IFRAME)$/.test(el.tagName)) || (name === "href" && el.tagName === "LINK");
  if (setAttribute)
    window.Element.prototype.setAttribute = function (this: Element, name: string, value: string): void {
      const isAddress = isMoved(this, name.toLowerCase());
      if (isAddress) mark(this);
      setAttribute.call(this, name, isAddress ? String(proxied(value)) : value);
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

  // reCAPTCHA frames its checkbox from this base and only trusts messages from the origin it names.
  let captcha: unknown;
  Object.defineProperty(window, "__recaptcha_api", {
    configurable: true,
    get: () => captcha,
    set: (value: unknown) => (captcha = typeof value === "string" ? String(proxied(value)) : value),
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
