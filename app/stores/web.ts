import { useEventListener } from "@vueuse/core";
import type { WebPage } from "~~/lib/web/page/protocol";
import type { ArtifactMeta } from "~~/shared/types/artifact";
import type { WebArrival, WebOpenReply, WebTrail } from "~~/shared/types/web";
import { Trail } from "~~/shared/utils/trail";

export type WebState = "down" | "live" | "starting" | "unreachable";

export interface WebOpenOptions {
  /** Lands on an artifact of this conversation already showing the address, as a link opened again should. */
  reuse?: boolean;
}

const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
const REMOVABLE_ROW = "[data-region='artifact-row']:is([data-kind='web'], [data-kind='file'])";

export const $web = defineStore(() => {
  const sc = useSidecar();
  const chrome = useChrome();
  const page = ref<WebPage>();
  const trail = ref<WebTrail>({ at: 0, urls: [] });
  const history = computed(() => ({
    back: trail.value.at > 0,
    forward: trail.value.at < trail.value.urls.length - 1,
  }));
  const stepping = ref<{ by: -1 | 1; to: string }>();
  const addressing = ref(0);
  const state = ref<WebState>("starting");
  const isBusy = ref(true);
  const edition = ref(0);
  let undo: { put: () => Promise<void>; toast: number } | undefined;
  let aim: number | undefined;
  // A frame the sidecar just (re)made lands where it was sent, so a redirect there replaces that page rather than adding one.
  let isLanding = true;

  function reload(): void {
    state.value = "starting";
    isBusy.value = true;
    isLanding = true;
    edition.value += 1;
  }

  function step(by: -1 | 1): void {
    const to = trail.value.urls[trail.value.at + by];
    if (!to) return;
    aim = trail.value.at + by;
    if (state.value === "live") {
      isBusy.value = true;
      stepping.value = { by, to };
      return;
    }
    page.value = { title: "", url: to };
    reload();
  }

  function seed(held?: WebTrail): void {
    if (!trail.value.urls.length && held) trail.value = held;
  }

  function arrive({ how, url }: { how: WebArrival; url: string }): void {
    trail.value = Trail.arrive(trail.value, { aim, how: isLanding ? "replace" : how, url });
    aim = undefined;
    isLanding = false;
  }

  function askAddress(): void {
    addressing.value += 1;
  }

  function reset(): void {
    page.value = undefined;
    trail.value = { at: 0, urls: [] };
    aim = undefined;
    isLanding = true;
    state.value = "starting";
    isBusy.value = true;
  }

  // Inside the artifact, whatever site it is on, as a tab goes wherever its address bar is sent.
  function visit(url: URL): void {
    trail.value = Trail.arrive(trail.value, { how: "push", url: url.href });
    page.value = { title: "", url: url.href };
    reload();
  }

  async function reread(): Promise<void> {
    sc.catalogue.value = await $fetch<ArtifactMeta[]>("/api/artifacts");
  }

  // The server records it against the conversation, and the next poll would only say so seconds later.
  async function open(url: string, { reuse = false }: WebOpenOptions = {}): Promise<WebOpenReply> {
    const key = sc.sessionKey.value;
    const got = await $fetch<WebOpenReply>("/api/web", { body: { reuse, session: key, url }, method: "POST" });
    await reread();
    sc.sessions.value = sc.sessions.value.map((one) =>
      one.key === key && !one.artifacts.includes(got.slug) ? { ...one, artifacts: [got.slug, ...one.artifacts] } : one,
    );
    return got;
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

  async function forget(meta: ArtifactMeta): Promise<() => Promise<void>> {
    if (meta.kind === "file") {
      const { path } = await $fetch<{ path: string }>(`/api/files/${meta.slug}`, { method: "DELETE" });
      const session = sc.sessionKey.value;
      return async () => void (await $fetch("/api/files/open", { body: { path, session }, method: "POST" }));
    }
    const record = await $fetch<Record<string, unknown>>(`/api/web/${meta.slug}`, { method: "DELETE" });
    return async () => void (await $fetch(`/api/web/${meta.slug}`, { body: record, method: "PUT" }));
  }

  // Only the entry goes: a web artifact's cookies and storage, or a file on disk, stay for when it is put back.
  async function remove(meta: ArtifactMeta): Promise<void> {
    const name = meta.title || meta.slug;
    try {
      const put = await forget(meta);
      sc.catalogue.value = sc.catalogue.value.filter((one) => one.slug !== meta.slug);
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

  // The pointer wins over focus, since a row clicked earlier keeps focus long after the pointer moved on.
  function removeAimed(): boolean {
    const row =
      document.querySelector<HTMLElement>(`${REMOVABLE_ROW}:hover`) ??
      document.activeElement?.closest<HTMLElement>(REMOVABLE_ROW);
    const meta = sc.catalogue.value.find((one) => one.slug === row?.dataset.slug);
    if (!meta) return false;
    void remove(meta);
    return true;
  }

  // Only while its toast is up, so a later ⌘Z can't bring back something long gone.
  function undoRemove(): boolean {
    const held = undo;
    if (!held || !chrome.toasts.value.some((one) => one.id === held.toast)) return false;
    void putBack();
    return true;
  }

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest(EDITABLE)) return;
    const key = event.key.toLowerCase();
    if ((key === "backspace" && removeAimed()) || (key === "z" && undoRemove())) event.preventDefault();
  });

  return {
    addressing,
    arrive,
    askAddress,
    edition,
    history,
    isBusy,
    open,
    page,
    reload,
    remove,
    removeAimed,
    reset,
    seed,
    state,
    step,
    stepping,
    trail,
    undoRemove,
    visit,
  };
});
