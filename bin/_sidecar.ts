import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Commands } from "../lib/sidecar/commands.ts";
import { SidecarConfig } from "../lib/sidecar/config.ts";
import { Sidecar } from "../lib/sidecar/paths.ts";
import * as Events from "../lib/sidecar/events.ts";
import type { Topics } from "../shared/types/events.ts";

type Command =
  "open" | "comments" | "publish" | "status" | "start" | "stop" | "restart" | "setup" | "uninstall" | "import" | "help";
type Proc = { pid: number; ppid: number; args: string };
type Point = { key?: string; slug?: string };

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ADDRESS = (process.env.SIDECAR_URL ?? "http://sidecar.localhost:4747").replace(/\/$/, "");
const PORT = new URL(ADDRESS).port || "80";
const NUXT = join(ROOT, "node_modules", "nuxt", "bin", "nuxt.mjs");
const SERVER = join(ROOT, ".output", "server", "index.mjs");
const SERVER_ENV = { NITRO_HOST: "localhost", NITRO_PORT: PORT, SIDECAR_ROOT: ROOT };
const LOG = join(Sidecar.home(), "server.log");
// The manifest's name is what tells the sidecar apart from anything else that took the port.
const NAME = "Claude Code Sidecar";
// Absolute, because a bin/open earlier on PATH shadows the system one inside a Notes-style tree.
const OPEN = "/usr/bin/open";
const DESKTOP = join(ROOT, "desktop");
const DESKTOP_APP = join(homedir(), "Applications", `${NAME}.app`);
const isDesktopInstalled = (): boolean => existsSync(DESKTOP_APP);
// The Electron userData, named after the app, holds the imported cookies and the import marker.
const APP_DATA = join(homedir(), "Library", "Application Support", NAME);
type Surface = "desktop" | "web";

function readSurface(): Surface | undefined {
  const { surface } = SidecarConfig.read();
  return surface === "desktop" || surface === "web" ? surface : undefined;
}

function writeSurface(surface: Surface): void {
  SidecarConfig.write({ surface });
}

const USAGE = `usage: sidecar [command]     /sidecar [command] in a Claude Code session runs the same

  open [key]  the default: start it when down, point it at the conversation, and bring an open
              sidecar to the front, else open it as the surface you chose in setup.
              The conversation is the key given, else the Claude Code session this runs in, and
              --artifact <slug|url> opens that page there, in Artifacts, an address as a new Web artifact
  comments <slug> [--reply <n> "text"] [--resolve <n> ["what changed"]] [--json]
              read the comment threads on an artifact, and answer or close one
  setup [desktop|web]
              choose how the sidecar runs and set it up. desktop builds and installs the Electron
              app, so Web artifacts render as real pages signed in with Chrome's cookies; web runs
              it as a tab in Chrome through the proxy. Prompts when run without an argument
  publish <topic> <json>
              append an event to the log every open sidecar streams, for this conversation.
              Topics: ${Events.TOPICS.join(", ")}
  status      whether it is up and where
  start       build it, then start it in the background and wait until it answers
  stop        stop it, wherever it was started from, a terminal's pnpm dev included
  restart     stop it, then build and start it, which is how a change to the sidecar goes live
  import      re-read Chrome's cookies into the desktop app (close the app first)
  uninstall   remove the desktop app and all its data, back to a clean slate

It serves ${ADDRESS} (SIDECAR_URL overrides it) and logs to ${LOG}.`;

async function isSidecar(): Promise<boolean> {
  const reply = await fetch(`${ADDRESS}/manifest.webmanifest`, { signal: AbortSignal.timeout(2000) }).catch(
    () => undefined,
  );
  if (!reply?.ok) return false;
  const manifest = (await reply.json().catch(() => ({}))) as { name?: string };
  return manifest.name === NAME;
}

async function waitUntilUp(hasDied: () => boolean = () => false): Promise<boolean> {
  for (const end = Date.now() + 90_000; Date.now() < end && !hasDied(); await sleep(1000)) {
    if (await isSidecar()) return true;
  }
  return false;
}

function listeners(): number[] {
  const { stdout } = spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  return stdout.split("\n").filter(Boolean).map(Number);
}

function processes(): Proc[] {
  return execFileSync("ps", ["-A", "-o", "pid=,ppid=,args="], { encoding: "utf8" })
    .split("\n")
    .flatMap((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] ?? "" }] : [];
    });
}

const isServerProcess = ({ args }: Proc): boolean =>
  args
    .split(/\s+/)
    .slice(0, 3)
    .some((word) => /(^|\/)(pnpm|nuxt|nuxi)(\.[cm]?js)?$/.test(word));

// Climbs from the listener while the parent is still pnpm or nuxt, so a terminal's `pnpm dev` stops whole and its shell stays.
function serverTree(listener: number): number[] {
  const table = processes();
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const callers = new Set<number>();
  for (let p = byPid.get(process.pid); p && p.pid > 1; p = byPid.get(p.ppid)) callers.add(p.pid);
  let top = listener;
  for (
    let parent = byPid.get(byPid.get(top)?.ppid ?? 0);
    parent && parent.pid > 1 && !callers.has(parent.pid) && isServerProcess(parent);
    parent = byPid.get(parent.ppid)
  ) {
    top = parent.pid;
  }
  const tree = [top];
  for (let i = 0; i < tree.length; i++) tree.push(...table.filter((p) => p.ppid === tree[i]).map((p) => p.pid));
  return tree.filter((pid) => !callers.has(pid));
}

function signal(pids: number[], name: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, name);
    } catch {
      // Already gone between the read and the signal.
    }
  }
}

function holderOf(pid: number): string {
  return spawnSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
}

async function status(): Promise<number> {
  const [pid] = listeners();
  if (pid && (await isSidecar())) {
    console.log(`up at ${ADDRESS}, pid ${pid}`);
    return 0;
  }
  if (pid) console.log(`down, and port ${PORT} is held by pid ${pid}, which is not the sidecar: ${holderOf(pid)}`);
  else console.log(`down. sidecar start brings it up at ${ADDRESS}`);
  return 1;
}

function build(): boolean {
  mkdirSync(Sidecar.home(), { recursive: true });
  const log = openSync(LOG, "w");
  console.log("building the sidecar");
  return spawnSync(process.execPath, [NUXT, "build"], { cwd: ROOT, stdio: ["ignore", log, log] }).status === 0;
}

function spawnServer(): () => boolean {
  const log = openSync(LOG, "a");
  // Detached into its own session, so it outlives this command and the terminal that ran it.
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    detached: true,
    env: { ...process.env, ...SERVER_ENV },
    stdio: ["ignore", log, log],
  });
  child.unref();
  let died = false;
  child.on("exit", () => (died = true));
  return () => died;
}

async function start(): Promise<number> {
  if (await isSidecar()) {
    console.log(`already up at ${ADDRESS}`);
    return 0;
  }
  const [pid] = listeners();
  if (pid) {
    console.error(`port ${PORT} is held by pid ${pid}, which is not the sidecar: ${holderOf(pid)}`);
    return 1;
  }
  if (!existsSync(NUXT)) {
    console.error(`nuxt is not installed in ${ROOT}; run pnpm install there first`);
    return 1;
  }
  if (!build()) {
    console.error(`the build failed; the log is ${LOG}`);
    return 1;
  }
  const hasDied = spawnServer();
  if (await waitUntilUp(hasDied)) {
    console.log(`up at ${ADDRESS}`);
    return 0;
  }
  console.error(`it did not come up; the log is ${LOG}`);
  return 1;
}

async function stop(): Promise<number> {
  const [pid] = listeners();
  if (!pid) {
    console.log("already down");
    return 0;
  }
  if (!(await isSidecar())) {
    console.error(`port ${PORT} is held by pid ${pid}, which is not the sidecar, so it stays: ${holderOf(pid)}`);
    return 1;
  }
  const tree = serverTree(pid);
  signal(tree, "SIGTERM");
  for (const end = Date.now() + 10_000; listeners().length && Date.now() < end;) await sleep(200);
  signal(tree, "SIGKILL");
  console.log("stopped");
  return 0;
}

function installedApp(): string | undefined {
  const dir = join(homedir(), "Applications", "Chrome Apps.localized");
  if (!existsSync(dir)) return undefined;
  // Found by the start URL its Chrome shim records, so renaming the app at install time does not lose it.
  return readdirSync(dir)
    .filter((name) => name.endsWith(".app"))
    .map((name) => join(dir, name))
    .find((app) => {
      const plistPath = join(app, "Contents", "Info.plist");
      const { stdout } = spawnSync("plutil", ["-extract", "CrAppModeShortcutURL", "raw", "-o", "-", plistPath], {
        encoding: "utf8",
      });
      return stdout.trim() === `${ADDRESS}/`;
    });
}

async function listenersAfterPointing({ key, slug }: Point): Promise<number> {
  const reply = await fetch(`${ADDRESS}/api/follow`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, slug, source: "claude" }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
  if (!reply?.ok) return 0;
  const { listeners } = (await reply.json().catch(() => ({}))) as { listeners?: number };
  return listeners ?? 0;
}

// Chrome lists its app windows too, so a sidecar already open is raised, even one still reconnecting after a restart.
const RAISE = `on run argv
  if application "Google Chrome" is not running then return "none"
  tell application "Google Chrome"
    repeat with w in windows
      set i to 0
      repeat with t in tabs of w
        set i to i + 1
        if URL of t starts with (item 1 of argv) then
          set active tab index of w to i
          set index of w to 1
          activate
          return "raised"
        end if
      end repeat
    end repeat
  end tell
  return "none"
end run`;

const raiseOpenWindow = (): boolean =>
  spawnSync("osascript", ["-e", RAISE, `${ADDRESS}/`], { encoding: "utf8" }).stdout.trim() === "raised";

type Option<T> = { value: T; label: string; hint: string };

// Cela's brand violet, from @cela/design via the cela pack in the create-artifact skill.
const CELA = { selection: "#6d28d9", onSelection: "#fafafa", hint: "#9b96ab" } as const;
const channels = (hex: string): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}`;
};
const dim = (s: string): string => `\x1b[38;2;${channels(CELA.hint)}m${s}\x1b[39m`;
const selected = (s: string): string =>
  `\x1b[48;2;${channels(CELA.selection)}m\x1b[38;2;${channels(CELA.onSelection)}m${s}\x1b[0m`;

function promptSelect<T>(title: string, options: readonly Option<T>[]): Promise<T | undefined> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) return Promise.resolve(undefined);
  const width = Math.max(...options.map((o) => o.label.length));
  const row = (o: Option<T>, here: boolean): string => {
    const body = ` ${here ? "›" : " "} ${o.label.padEnd(width)}  `;
    return here ? selected(`${body}${o.hint} `) : `${body}${dim(o.hint)}`;
  };
  const footer = dim("   ↑↓ move   enter pick   esc cancel");

  return new Promise((resolve) => {
    let cursor = 0;
    const draw = (first: boolean): void => {
      if (!first) stdout.write(`\x1b[${options.length + 1}A`);
      stdout.write(`\x1b[0J${options.map((o, i) => row(o, i === cursor)).join("\n")}\n${footer}\n`);
    };
    const finish = (value?: T): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\x1b[?25h");
      resolve(value);
    };
    const onData = (data: string): void => {
      if (data === "\x1b[A" || data === "k") cursor = (cursor + options.length - 1) % options.length;
      else if (data === "\x1b[B" || data === "j") cursor = (cursor + 1) % options.length;
      else if (data === "\r" || data === "\n") return finish(options[cursor]?.value);
      else if (data === "\x1b" || data === "q" || data === "\x03") return finish(undefined);
      else return;
      draw(false);
    };

    stdout.write(`${title}\n\x1b[?25l`);
    draw(true);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}

const SURFACES: readonly Option<Surface>[] = [
  { value: "desktop", label: "Desktop app", hint: "real pages, signed in with your Chrome cookies, a separate Chromium (heavier)" },
  { value: "web", label: "Webapp", hint: "a tab in Chrome, light, Web artifacts through the proxy" },
];

const chooseSurface = (): Promise<Surface | undefined> =>
  promptSelect("How do you want to run the sidecar?", SURFACES);

async function open({ key = process.env.CLAUDE_CODE_SESSION_ID?.slice(0, 8), slug }: Point): Promise<number> {
  if (slug && !key) {
    console.error(`no conversation to open ${slug} in: run it inside Claude Code, or give the key`);
    return 2;
  }
  if (!(await isSidecar()) && (await start()) !== 0) return 1;
  let surface = readSurface();
  // First run with a terminal attached picks the surface now; inside Claude Code there is no TTY, so it falls back.
  if (!surface && process.stdin.isTTY) {
    surface = await chooseSurface();
    if (surface) {
      writeSurface(surface);
      if (surface === "desktop" && !isDesktopInstalled() && (await installDesktop()) !== 0) return 1;
    }
  }
  const listening = key ? await listenersAfterPointing({ key, slug }) : 0;
  const what = slug ? `${slug} in conversation ${key}` : `conversation ${key}`;
  if (raiseOpenWindow()) {
    console.log(`brought the open sidecar to the front${key ? ` on ${what}` : ""}`);
    return 0;
  }
  // Desktop surface opens the real-page shell and wins over Chrome; webapp never does, so it skips to a Chrome window.
  if (surface !== "web" && isDesktopInstalled() && spawnSync(OPEN, [DESKTOP_APP]).status === 0) {
    console.log(`opened the desktop app${key ? ` on ${what}` : ""}`);
    return 0;
  }
  if (listening) {
    console.log(`moved the open sidecar to ${what}`);
    return 0;
  }
  // The installed app opens on its home, which follows the point just made.
  const app = installedApp();
  if (app && spawnSync(OPEN, [app]).status === 0) {
    console.log(`opened the ${basename(app, ".app")} app`);
    return 0;
  }
  const page = key ? `${ADDRESS}/c/${key}${slug ? `?artifact=${encodeURIComponent(slug)}` : ""}` : `${ADDRESS}/`;
  // -n hands --app to a Chrome that is already running; without it the flag is dropped.
  if (spawnSync(OPEN, ["-na", "Google Chrome", "--args", `--app=${page}`]).status === 0) {
    console.log(`opened ${page} in a Chrome app window`);
    return 0;
  }
  if (spawnSync(OPEN, [page]).status === 0) {
    console.log(`opened ${page} in the browser`);
    return 0;
  }
  console.error(`could not open ${page}`);
  return 1;
}

// Works with the sidecar down too: the event waits in the log and streams once a sidecar reads it.
function publish(): number {
  const [topic = "", body = "{}"] = process.argv.slice(3);
  if (!Events.isTopic(topic)) {
    console.error(`sidecar: no topic '${topic}'. Topics: ${Events.TOPICS.join(", ")}`);
    return 2;
  }
  try {
    Events.publish({ topic, data: JSON.parse(body) as Topics[typeof topic] });
  } catch (error) {
    console.error(`sidecar: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  console.log(`published ${topic} to ${Events.logFile()}`);
  return 0;
}

function buildDesktop(): boolean {
  return spawnSync(process.execPath, [join(DESKTOP, "build.ts"), "--package"], { cwd: DESKTOP, stdio: "inherit" }).status === 0;
}

async function installDesktop(): Promise<number> {
  if (!existsSync(join(DESKTOP, "node_modules", "electron"))) {
    console.error(`electron is not installed in ${DESKTOP}; run pnpm install there first`);
    return 1;
  }
  if (!buildDesktop()) {
    console.error("the desktop build failed");
    return 1;
  }
  const built = join(DESKTOP, "out", `${NAME}-darwin-${process.arch}`, `${NAME}.app`);
  if (!existsSync(built)) {
    console.error(`the packaged app is not at ${built}`);
    return 1;
  }
  mkdirSync(dirname(DESKTOP_APP), { recursive: true });
  rmSync(DESKTOP_APP, { force: true, recursive: true });
  if (spawnSync("cp", ["-R", built, DESKTOP_APP]).status !== 0) {
    console.error(`could not copy the app to ${DESKTOP_APP}`);
    return 1;
  }
  if (!(await isSidecar()) && (await start()) !== 0) return 1;
  spawnSync(OPEN, [DESKTOP_APP]);
  console.log(`set up the desktop app at ${DESKTOP_APP}, and opened it`);
  return 0;
}

async function setup(): Promise<number> {
  const arg = process.argv[3];
  let surface: Surface | undefined = arg === "desktop" || arg === "web" ? arg : undefined;
  if (!surface) {
    if (!process.stdin.isTTY) {
      console.error("run sidecar setup in a terminal, or sidecar setup desktop|web");
      return 2;
    }
    surface = await chooseSurface();
    if (!surface) {
      console.log("no choice made, nothing changed");
      return 1;
    }
  }
  writeSurface(surface);
  if (surface === "desktop") return installDesktop();
  if (!(await isSidecar()) && (await start()) !== 0) return 1;
  console.log("set up to run as a webapp in Chrome; sidecar open opens it");
  return 0;
}

// Close the app first: a running one holds the cookie store, so a separate import process cannot open it.
function importCookies(): number {
  if (!isDesktopInstalled()) {
    console.error("no desktop app to import into; run sidecar setup and choose desktop first");
    return 1;
  }
  return spawnSync(join(DESKTOP_APP, "Contents", "MacOS", NAME), ["--import"], { stdio: "inherit" }).status === 0 ? 0 : 1;
}

// The app bundle, the Electron userData that holds the imported cookies, and the surface choice, so a fresh setup starts clean.
function uninstall(): number {
  const had = isDesktopInstalled();
  for (const path of [DESKTOP_APP, APP_DATA, SidecarConfig.file()]) rmSync(path, { force: true, recursive: true });
  console.log(had ? "removed the desktop app and all its data" : "removed the sidecar's data");
  return 0;
}

const COMMANDS = {
  open: async () => {
    const { positionals, values } = parseArgs({
      args: process.argv.slice(3),
      allowPositionals: true,
      options: { artifact: { type: "string" } },
    });
    const key = positionals[0] ?? process.env.CLAUDE_CODE_SESSION_ID?.slice(0, 8);
    return open({ key, slug: values.artifact && Commands.artifact(values.artifact, key) });
  },
  comments: async () => Commands.comments(process.argv.slice(3)),
  publish: async () => publish(),
  status,
  start,
  stop,
  restart: async () => ((await stop()) === 0 ? start() : 1),
  setup,
  uninstall: async () => uninstall(),
  import: async () => importCookies(),
  help: async () => (console.log(USAGE), 0),
} satisfies Record<Command, () => Promise<number>>;

const asked = process.argv[2] ?? "open";
const run = Object.hasOwn(COMMANDS, asked) ? COMMANDS[asked as Command] : undefined;
if (!run) {
  console.error(`sidecar: no command '${asked}'\n\n${USAGE}`);
  process.exit(2);
}
process.exit(await run());
