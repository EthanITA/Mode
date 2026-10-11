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
        return (tty of selected tab of w) & linefeed & (custom title of selected tab of w)
      end try
    end repeat
  end tell
end if
return ""`;

const TERMINAL_EVERY_MS = 1000;

// Long enough for `/sidecar` to launch the app and have its home read the point, short enough that a reopened app stays idle.
export const POINT_TTL_MS = 15_000;

let target: FollowTarget = { source: "none" };
let pointedAt = 0;
const listeners = new Set<Listener>();
let watch: Watch | undefined;

export function standingTarget(now = Date.now()): FollowTarget {
  return now - pointedAt < POINT_TTL_MS ? target : { source: "none" };
}

export function pointAt({
  face,
  key,
  slug,
  source,
}: {
  face?: string;
  key: string;
  slug?: string;
  source: Exclude<FollowSource, "none">;
}): number {
  const entry = liveEntries().find((one) => keyOf(one.id) === key);
  target = { face, key, name: entry?.name, slug, source };
  pointedAt = Date.now();
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

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 2000 }, (error, stdout) => resolve(error ? "" : String(stdout)));
  });
}

// A tab keeps its title after claude exits, so only a claude holding the tab's terminal makes the title mean a conversation.
export function hasForegroundClaude(psOutput: string): boolean {
  return psOutput.split("\n").some((line) => {
    const [stat = "", command = ""] = line.trim().split(/\s+/);
    return stat.includes("+") && command.split("/").pop() === "claude";
  });
}

async function frontTitle(): Promise<string> {
  const [tty = "", ...title] = (await run("osascript", ["-e", SCRIPT])).trim().split("\n");
  if (!tty) return "";
  const processes = await run("ps", ["-t", tty.replace("/dev/", ""), "-o", "stat=,command="]);
  return hasForegroundClaude(processes) ? title.join("\n").trim() : "";
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
  if (!isBaseline && key && key !== standingTarget().key) pointAt({ key, source: "terminal" });
}

// Polls only while a page listens, because one osascript call takes about a tenth of a second.
function watchTerminal(): void {
  const current: Watch = { timer: setInterval(() => void tick(current), TERMINAL_EVERY_MS), isBaseline: !!standingTarget().key };
  watch = current;
  void tick(current);
}
