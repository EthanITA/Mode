import type { How } from "~~/shared/types/mode";

// The prefix encodes how the slot was set, the vocabulary bin/mode already uses.
const SIGILS: Record<How, string> = {
  auto: "",
  chosen: "~",
  pinned: "=",
  typed: "",
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function sigil(how: How): string {
  return SIGILS[how];
}

export function homePath(cwd: string): string {
  const home = cwd.match(/^\/Users\/[^/]+/)?.[0];
  return home ? `~${cwd.slice(home.length)}` : cwd;
}

export function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

/** Slugs are the fallback when an artifact carries no title of its own. */
export function deslug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

export function relativeAge(stamp?: string, now: number = Date.now()): string {
  if (!stamp) return "";
  const at = Date.parse(stamp);
  if (Number.isNaN(at)) return stamp;
  const ago = Math.max(now - at, 0);
  if (ago < MINUTE) return "just now";
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)} hr`;
  const days = Math.floor(ago / DAY);
  return days === 1 ? "1 day" : `${days} days`;
}

/** "user" is the seed's own word for Marco; the design shows the author as YOU. */
export function authorOf(by: string): string {
  return by === "user" ? "you" : by;
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
