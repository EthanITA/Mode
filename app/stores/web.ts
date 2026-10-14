import { useEventListener } from "@vueuse/core";
import type { WebPage } from "~~/lib/web/page/protocol";
import type { ArtifactMeta } from "~~/shared/types/artifact";
import type { WebOpenReply } from "~~/shared/types/web";

export type WebState = "down" | "live" | "moved" | "starting" | "unreachable";

export interface WebOpenOptions {
  /** Where the frame was sent, so the server opens it as it is rather than chasing it again. */
  landed?: boolean;
}

// Redirects that run this long without a page are a loop, so the frame stops and says so.
const HOPS = 8;
const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

export const $web = defineStore(() => {
  const sc = useSidecar();
  const chrome = useChrome();
  const page = ref<WebPage>();
  const state = ref<WebState>("starting");
  const edition = ref(0);
  const going = ref<string>();
  const movedTo = ref<string>();
  const hops = ref(0);
  // An entry a redirect made and passed through without a page, which goes once the redirect moves on.
  const passing = new Set<string>();
  let undo: { put: () => Promise<void>; toast: number } | undefined;

  function reload(): void {
    state.value = "starting";
    movedTo.value = undefined;
    edition.value += 1;
  }

  function go(path: string): void {
    going.value = path;
  }

  function reset(): void {
    page.value = undefined;
    state.value = "starting";
    going.value = undefined;
    movedTo.value = undefined;
  }

  async function reread(): Promise<void> {
    sc.catalogue.value = await $fetch<ArtifactMeta[]>("/api/artifacts");
  }

  // The server records it against the conversation, and the next poll would only say so seconds later.
  async function open(url: string, { landed = false }: WebOpenOptions = {}): Promise<WebOpenReply> {
    const key = sc.sessionKey.value;
    const got = await $fetch<WebOpenReply>("/api/web", { body: { landed, session: key, url }, method: "POST" });
    if (got.isNew) passing.add(got.slug);
    if (!landed) hops.value = 0;
    await reread();
    sc.sessions.value = sc.sessions.value.map((one) =>
      one.key === key && !one.artifacts.includes(got.slug) ? { ...one, artifacts: [got.slug, ...one.artifacts] } : one,
    );
    return got;
  }

  // An entry is one site, and a typed one may really live at another, google.com at www, so the server settles which.
  async function visit({ slug, typed }: { slug: string; typed: URL }): Promise<string> {
    const got = await open(typed.href);
    if (got.slug === slug) {
      page.value = { title: "", url: got.url };
      reload();
    }
    return got.slug;
  }

  function shown(slug: string): void {
    passing.delete(slug);
    hops.value = 0;
  }

  // Taken as the redirect gave it, since probing it again would spend a sign-in's one-time code.
  async function follow(slug: string): Promise<string | undefined> {
    const to = movedTo.value;
    if (!to || hops.value >= HOPS) return undefined;
    hops.value += 1;
    state.value = "starting";
    const got = await open(to, { landed: true });
    if (got.slug === slug) {
      page.value = { title: "", url: got.url };
      reload();
    } else if (passing.delete(slug)) {
      await $fetch(`/api/web/${slug}`, { method: "DELETE" }).catch(() => undefined);
      await reread();
    }
    return got.slug;
  }

  async function putBack(): Promise<void> {
    const held = undo;
    undo = undefined;
    if (!held) return;
    chrome.toasts.value = chrome.toasts.value.filter((one) => one.id !== held.toast);
    try {
      await held.put();
      await reread();
    } catch {
      chrome.toast("The entry could not be put back", "destructive");
    }
  }

  // The app itself isn't touched, and its cookies and storage stay where they are for the site opened again.
  async function remove(meta: ArtifactMeta): Promise<void> {
    const name = meta.title || meta.slug;
    try {
      const record = await $fetch<Record<string, unknown>>(`/api/web/${meta.slug}`, { method: "DELETE" });
      sc.catalogue.value = sc.catalogue.value.filter((one) => one.slug !== meta.slug);
      const put = async (): Promise<void> => {
        await $fetch<WebOpenReply>(`/api/web/${meta.slug}`, { body: record, method: "PUT" });
      };
      const toast = chrome.notify({
        action: "Undo",
        open: () => void putBack(),
        text: `Removed ${name} from Artifacts`,
        tip: "Put it back with its threads · {cmd Z}",
      });
      undo = { put, toast };
    } catch {
      chrome.toast(`${name} could not be removed`, "destructive");
    }
  }

  // Only while its toast is up, so a later ⌘Z can't bring back something long gone.
  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    const held = undo;
    if (!held || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
    if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
    if (!chrome.toasts.value.some((one) => one.id === held.toast)) return;
    event.preventDefault();
    void putBack();
  });

  return {
    edition,
    follow,
    go,
    going,
    hops,
    movedTo,
    open,
    page,
    reload,
    remove,
    reset,
    shown,
    state,
    visit,
  };
});
