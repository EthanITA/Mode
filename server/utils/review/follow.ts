import { execFile } from "node:child_process";
import type { FollowSource, FollowTarget } from "../../../shared/types/review.ts";
import { keyOf } from "../sessions/paths.ts";
import { liveEntries, type RegistryEntry } from "../sessions/registry.ts";

type Listener = (target: FollowTarget) => void;

type Front = { key?: string };

type Watch = {
  timer: ReturnType<typeof setInterval>;
  seen?: Front;
  holdsPoint: boolean;
};

// Guarded on `is running` so asking never launches Terminal; a tabless ghost window has no id, so it is skipped.
const SCRIPT = `if application "Terminal" is running then
  tell application "Terminal"
    set ids to id of every window
    repeat with wid in ids
      set wid to contents of wid
      if wid is not missing value then return custom title of selected tab of window id wid
    end repeat
  end tell
end if
return ""`;

const TERMINAL_EVERY_MS = 1000;
const FRESH_MS = 15_000;

let target: FollowTarget = { source: "none" };
let pointedAt = 0;
const listeners = new Set<Listener>();
let watch: Watch | undefined;

export type Point = { face?: string; key: string; slug?: string; source: Exclude<FollowSource, "none"> };

function isFresh(): boolean {
  return Date.now() - pointedAt < FRESH_MS;
}

function targetAt({ face, key, slug, source }: Point): FollowTarget {
  const entry = liveEntries().find((one) => keyOf(one.id) === key);
  return { face, key, name: entry?.name, slug, source };
}

export function followTarget(): FollowTarget | undefined {
  if (isFresh()) return target;
  const front = watch?.seen;
  if (!front) return undefined;
  return front.key ? targetAt({ key: front.key, source: "terminal" }) : { source: "terminal" };
}

function publish(next: FollowTarget): number {
  target = next;
  pointedAt = Date.now();
  for (const listener of listeners) listener(target);
  return listeners.size;
}

export function pointAt(point: Point): number {
  return publish(targetAt(point));
}

export function onFollow(listener: Listener): () => void {
  listeners.add(listener);
  if (!watch) watchTerminal();
  return () => {
    listeners.delete(listener);
    if (listeners.size || !watch) return;
    clearInterval(watch.timer);
    watch = undefined;
  };
}

function frontTitle(): Promise<{ title: string } | undefined> {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", SCRIPT], { timeout: 2000 }, (error, stdout) =>
      resolve(error ? undefined : { title: String(stdout).trim() }),
    );
  });
}

// Claude Code prefixes a busy session's title with a spinner glyph that changes on every read.
function nameOf(title: string): string {
  return title.replace(/^[^\p{L}\p{N}[]+/u, "").trim();
}

function newest(entries: RegistryEntry[]): RegistryEntry | undefined {
  return [...entries].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
}

async function frontKey(): Promise<Front | undefined> {
  const read = await frontTitle();
  if (!read) return undefined;
  const name = nameOf(read.title);
  const entry = name ? newest(liveEntries().filter((one) => one.name === name)) : undefined;
  return { key: entry && keyOf(entry.id) };
}

async function tick(current: Watch): Promise<void> {
  const front = await frontKey();
  if (watch !== current || !front) return;
  const before = current.seen;
  current.seen = front;
  if (before ? before.key === front.key : current.holdsPoint) return;
  if (!front.key) publish({ source: "terminal" });
  else if (!before || front.key !== target.key) pointAt({ key: front.key, source: "terminal" });
}

// Polls only while a page listens, because one osascript call takes about a tenth of a second.
function watchTerminal(): void {
  const holdsPoint = isFresh() && !!target.key;
  const current: Watch = { timer: setInterval(() => void tick(current), TERMINAL_EVERY_MS), holdsPoint };
  watch = current;
  void tick(current);
}
