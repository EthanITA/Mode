import type { WebArrival, WebTrail } from "../types/web.ts";

const DEPTH = 50;

export interface TrailArrival {
  /** The index a step from the sidecar asked for, which wins whatever the frame calls the move. */
  aim?: number;
  how: WebArrival;
  url: string;
}

const isPage = (url: unknown): url is string =>
  typeof url === "string" && URL.canParse(url) && /^https?:$/.test(new URL(url).protocol);

function of(raw: unknown): WebTrail | undefined {
  if (typeof raw !== "object" || !raw) return undefined;
  const { at, urls } = raw as Partial<WebTrail>;
  if (!Array.isArray(urls) || !urls.length || urls.length > DEPTH || !urls.every(isPage)) return undefined;
  return typeof at === "number" && Number.isInteger(at) && at >= 0 && at < urls.length ? { at, urls } : undefined;
}

// A traverse the site made itself lands on the nearest copy of its page, so a page visited twice steps the right way.
function nearest(urls: string[], { at, url }: { at: number; url: string }): number {
  let found = -1;
  urls.forEach((one, index) => {
    if (one === url && (found < 0 || Math.abs(index - at) < Math.abs(found - at))) found = index;
  });
  return found;
}

function arrive(trail: WebTrail, { aim, how, url }: TrailArrival): WebTrail {
  const { at, urls } = trail;
  if (!urls.length) return { at: 0, urls: [url] };
  const swap = (index: number): WebTrail => ({
    at: index,
    urls: urls.map((one, i) => (i === index ? url : one)),
  });
  if (typeof aim === "number" && aim >= 0 && aim < urls.length) return swap(aim);
  if (urls[at] === url) return trail;
  if (how === "replace" || how === "reload") return swap(at);
  const near = how === "traverse" ? nearest(urls, { at, url }) : -1;
  if (near >= 0) return { at: near, urls };
  const next = [...urls.slice(0, at + 1), url].slice(-DEPTH);
  return { at: next.length - 1, urls: next };
}

export const Trail = { arrive, of };
