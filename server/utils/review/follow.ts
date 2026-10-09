import { execFile } from "node:child_process";
import type { FollowSource, FollowTarget } from "../../../shared/types/review.ts";
import { keyOf } from "../sessions/paths.ts";
import { liveEntries, type RegistryEntry } from "../sessions/registry.ts";

type Listener = (target: FollowTarget) => void;

type Watch = {
  timer: ReturnType<typeof setInterval>;
  seen?: string;
  isBaseline: boolean;
};

// Guarded on `is running` so asking never launches Terminal; a tabless ghost window can sit at index 1, so it is skipped.
const SCRIPT = `if application "Terminal" is running then
  tell application "Terminal"
    repeat with w in windows
      try
        return custom title of selected tab of w
      end try
    end repeat
  end tell
end if
return ""`;

const TERMINAL_EVERY_MS = 1000;

let target: FollowTarget = { source: "none" };
const listeners = new Set<Listener>();
let watch: Watch | undefined;

export function followTarget(): FollowTarget {
  return target;
}

export function pointAt({
  face,
  key,
  source,
}: {
  face?: string;
  key: string;
  source: Exclude<FollowSource, "none">;
}): number {
  const entry = liveEntries().find((one) => keyOf(one.id) === key);
  target = { face, key, name: entry?.name, source };
  for (const listener of listeners) listener(target);
  return listeners.size;
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

function frontTitle(): Promise<string> {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", SCRIPT], { timeout: 2000 }, (error, stdout) =>
      resolve(error ? "" : String(stdout).trim()),
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

async function frontKey(): Promise<string | undefined> {
  const name = nameOf(await frontTitle());
  const entry = name ? newest(liveEntries().filter((one) => one.name === name)) : undefined;
  return entry && keyOf(entry.id);
}

// Points only when the front tab switches, so a `/sidecar` point already standing holds until then.
async function tick(current: Watch): Promise<void> {
  const key = await frontKey();
  if (watch !== current) return;
  const isBaseline = current.isBaseline;
  current.isBaseline = false;
  if (key === current.seen) return;
  current.seen = key;
  if (!isBaseline && key && key !== target.key) pointAt({ key, source: "terminal" });
}

// Polls only while a page listens, because one osascript call takes about a tenth of a second.
function watchTerminal(): void {
  const current: Watch = { timer: setInterval(() => void tick(current), TERMINAL_EVERY_MS), isBaseline: !!target.key };
  watch = current;
  void tick(current);
}
