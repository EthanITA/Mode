import type { WebPage } from "~~/lib/web/page/protocol";
import type { ArtifactMeta } from "~~/shared/types/artifact";
import type { WebOpenReply } from "~~/shared/types/web";

export type WebState = "down" | "live" | "moved" | "starting" | "unreachable";

export const $web = defineStore(() => {
  const sc = useSidecar();
  const page = ref<WebPage>();
  const state = ref<WebState>("starting");
  const edition = ref(0);
  const going = ref<string>();
  const movedTo = ref<string>();

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

  // The server records it against the conversation, and the next poll would only say so seconds later.
  async function open(url: string): Promise<WebOpenReply> {
    const key = sc.sessionKey.value;
    const got = await $fetch<WebOpenReply>("/api/web", { body: { session: key, url }, method: "POST" });
    sc.catalogue.value = await $fetch<ArtifactMeta[]>("/api/artifacts");
    sc.sessions.value = sc.sessions.value.map((one) =>
      one.key === key && !one.artifacts.includes(got.slug) ? { ...one, artifacts: [got.slug, ...one.artifacts] } : one,
    );
    return got;
  }

  // An entry is one origin, since its proxy, port and storage are, so only another origin earns a new one.
  async function visit({ slug, typed }: { slug: string; typed: URL }): Promise<string> {
    const here = page.value?.url ?? sc.artifact.value?.url;
    if (here && new URL(here).origin === typed.origin) {
      page.value = { title: "", url: typed.href };
      reload();
      return slug;
    }
    const got = await open(typed.href);
    if (got.slug === slug) {
      page.value = { title: "", url: got.url };
      reload();
    }
    return got.slug;
  }

  return { edition, go, going, movedTo, open, page, reload, reset, state, visit };
});
