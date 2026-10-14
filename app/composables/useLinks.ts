import type { FileOpenReply } from "~~/shared/types/files";

export interface LinkOpenOptions {
  /** The folder a relative link is read against: the page's own, else the conversation's. */
  base?: string;
}

export interface Links {
  open: (href: string, options?: LinkOpenOptions) => Promise<void>;
  /** True for what open() takes over: a web address or a file, never an in-page anchor or a mail link. */
  owns: (href: string) => boolean;
}

const WEB = /^https?:\/\//i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function pathOf(href: string): string {
  if (/^file:/i.test(href)) return decodeURIComponent(new URL(href).pathname);
  return decodeURIComponent(href.split(/[?#]/)[0] ?? "");
}

// Every link in the sidecar lands in Artifacts, since following one in place would leave the conversation behind.
export function useLinks(): Links {
  const sc = useSidecar();
  const chrome = useChrome();
  const web = $web();
  const follow = $follow();
  const filesPick = useConversationPick("fl:picks");

  const owns = (href: string): boolean => {
    const raw = href.trim();
    return !!raw && !raw.startsWith("#") && (WEB.test(raw) || /^file:/i.test(raw) || !SCHEME.test(raw));
  };

  async function open(href: string, { base }: LinkOpenOptions = {}): Promise<void> {
    const raw = href.trim();
    const key = sc.sessionKey.value;
    if (!owns(raw) || !key) return;
    try {
      if (WEB.test(raw)) {
        follow.show({ key, slug: (await web.open(raw)).slug });
        return;
      }
      const cwd = sc.sessions.value.find((one) => one.key === key)?.cwd;
      const got = await $fetch<FileOpenReply>("/api/files/open", {
        body: { base: base ?? cwd, path: pathOf(raw), session: key },
        method: "POST",
      });
      if (got.at === "files") {
        filesPick.value = got.path;
        chrome.view.set("files");
        return;
      }
      sc.sessions.value = sc.sessions.value.map((one) =>
        one.key === key && !one.artifacts.includes(got.slug)
          ? { ...one, artifacts: [got.slug, ...one.artifacts] }
          : one,
      );
      follow.show({ key, slug: got.slug });
    } catch (error) {
      chrome.toast(failReason(error) ?? "That link could not be opened here", "destructive");
    }
  }

  return { open, owns };
}
