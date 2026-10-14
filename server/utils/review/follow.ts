import { execFile } from "node:child_process";
import type { FollowSource, FollowTarget } from "../../../shared/types/review.ts";
import { keyOf } from "../sessions/paths.ts";
import { liveEntries, type RegistryEntry } from "../sessions/registry.ts";

type Listener = (target: FollowTarget) => void;

type Front = { key?: string };

type Watch = {
  timer: ReturnType<typeof setInterval>;
  seen?: Front;
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

let target: FollowTarget = { source: "none" };
// Read when /sidecar points, because no page may be listening to see the front tab switch after it.
let pointedFrom: Promise<Front | undefined> | undefined;
const listeners = new Set<Listener>();
let watch: Watch | undefined;

export type Point = { face?: string; key: string; slug?: string; source: Exclude<FollowSource, "none"> };

function targetAt({ face, key, slug, source }: Point): FollowTarget {
  const entry = liveEntries().find((one) => keyOf(one.id) === key);
  return { face, key, name: entry?.name, slug, source };
}

export function followTarget(): FollowTarget | undefined {
  return watch?.seen ? target : undefined;
}

function publish(next: FollowTarget): number {
  target = next;
  for (const listener of listeners) listener(target);
  return listeners.size;
}

export function pointAt(point: Point): number {
  pointedFrom = frontKey();
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

function isRunning(key?: string): boolean {
  return !!key && liveEntries().some((one) => keyOf(one.id) === key);
}

async function tick(current: Watch): Promise<void> {
  const front = await frontKey();
  const from = await pointedFrom;
  if (watch !== current || !front) return;
  const before = current.seen;
  current.seen = front;
  // `claude agents` shows a conversation under its own title, so only the followed one exiting means Listening.
  const isLeft = !front.key && !isRunning(target.key);
  if (before && before.key === front.key) {
    if (isLeft && target.key) publish({ source: "terminal" });
    return;
  }
  if (!before && pointedFrom && (!from || from.key === front.key)) {
    publish(target);
    return;
  }
  pointedFrom = undefined;
  if (isLeft) publish({ source: "terminal" });
  else if (front.key && (!before || front.key !== target.key))
    publish(targetAt({ key: front.key, source: "terminal" }));
}

// Polls only while a page listens, because one osascript call takes about a tenth of a second.
function watchTerminal(): void {
  const current: Watch = { timer: setInterval(() => void tick(current), TERMINAL_EVERY_MS) };
  watch = current;
  void tick(current);
}
