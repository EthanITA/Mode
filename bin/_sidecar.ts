import { execFileSync, spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, openSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir, userInfo } from "node:os"
import { basename, dirname, join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { modeHome } from "../server/utils/mode/paths.ts"

type Command = "open" | "status" | "start" | "stop" | "restart" | "install" | "uninstall" | "help"
type Proc = { pid: number; ppid: number; args: string }

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ADDRESS = (process.env.SIDECAR_URL ?? "http://sidecar.localhost:4747").replace(/\/$/, "")
const PORT = new URL(ADDRESS).port || "80"
const NUXT = join(ROOT, "node_modules", "nuxt", "bin", "nuxt.mjs")
const LOG = join(modeHome(), "sidecar.log")
const LABEL = "local.mode.sidecar"
const AGENT = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`)
const DOMAIN = `gui/${userInfo().uid}`
const SERVICE = `${DOMAIN}/${LABEL}`
// The manifest's name is what tells the sidecar apart from anything else that took the port.
const NAME = "Claude Code Sidecar"
// Absolute, because a bin/open earlier on PATH shadows the system one inside a Notes-style tree.
const OPEN = "/usr/bin/open"

const USAGE = `usage: sidecar [command]     /sidecar [command] in a Claude Code session runs the same

  open [key]  the default: start it when down, point it at the conversation, and open the installed
              app, else a Chrome app window, unless a sidecar page is already open and moved there.
              The conversation is the key given, else the Claude Code session this runs in
  status      whether it is up, where, and whether it starts at login
  start       start it in the background and wait until it answers
  stop        stop it, wherever it was started from
  restart     stop it, then start it
  install     start it now and at every login, through launchd
  uninstall   stop it and take it off login

It serves ${ADDRESS} (SIDECAR_URL overrides it) and logs to ${LOG}.`

async function isSidecar(): Promise<boolean> {
  const reply = await fetch(`${ADDRESS}/manifest.webmanifest`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
  if (!reply?.ok) return false
  const manifest = (await reply.json().catch(() => ({}))) as { name?: string }
  return manifest.name === NAME
}

async function waitUntilUp(hasDied: () => boolean = () => false): Promise<boolean> {
  for (const end = Date.now() + 90_000; Date.now() < end && !hasDied(); await sleep(1000)) {
    if (await isSidecar()) return true
  }
  return false
}

function listeners(): number[] {
  const { stdout } = spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" })
  return stdout.split("\n").filter(Boolean).map(Number)
}

function processes(): Proc[] {
  return execFileSync("ps", ["-A", "-o", "pid=,ppid=,args="], { encoding: "utf8" })
    .split("\n")
    .flatMap(line => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
      return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] }] : []
    })
}

const isServerProcess = ({ args }: Proc): boolean =>
  args.split(/\s+/).slice(0, 3).some(word => /(^|\/)(pnpm|nuxt|nuxi)(\.[cm]?js)?$/.test(word))

// Climbs from the listener while the parent is still pnpm or nuxt, so a terminal's `pnpm dev` stops whole and its shell stays.
function serverTree(listener: number): number[] {
  const table = processes()
  const byPid = new Map(table.map(p => [p.pid, p]))
  const callers = new Set<number>()
  for (let p = byPid.get(process.pid); p && p.pid > 1; p = byPid.get(p.ppid)) callers.add(p.pid)
  let top = listener
  for (let parent = byPid.get(byPid.get(top)?.ppid ?? 0); parent && parent.pid > 1 && !callers.has(parent.pid) && isServerProcess(parent); parent = byPid.get(parent.ppid)) {
    top = parent.pid
  }
  const tree = [top]
  for (let i = 0; i < tree.length; i++) tree.push(...table.filter(p => p.ppid === tree[i]).map(p => p.pid))
  return tree.filter(pid => !callers.has(pid))
}

function signal(pids: number[], name: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, name)
    } catch {
      // Already gone between the read and the signal.
    }
  }
}

function holderOf(pid: number): string {
  return spawnSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim()
}

const isInstalled = (): boolean => existsSync(AGENT)
const isLoaded = (): boolean => spawnSync("launchctl", ["print", SERVICE], { stdio: "ignore" }).status === 0

function launchctl(...args: string[]): boolean {
  return spawnSync("launchctl", args, { stdio: "inherit" }).status === 0
}

async function status(): Promise<number> {
  const login = isInstalled() ? ", and it starts at login" : ""
  const [pid] = listeners()
  if (pid && (await isSidecar())) {
    console.log(`up at ${ADDRESS}, pid ${pid}${login}`)
    return 0
  }
  if (pid) console.log(`down, and port ${PORT} is held by pid ${pid}, which is not the sidecar: ${holderOf(pid)}`)
  else console.log(`down${login}. sidecar start brings it up at ${ADDRESS}`)
  return 1
}

function spawnServer(): () => boolean {
  mkdirSync(modeHome(), { recursive: true })
  const log = openSync(LOG, "w")
  // Detached into its own session, so it outlives this command and the terminal that ran it.
  const child = spawn(process.execPath, [NUXT, "dev", "--port", PORT], { cwd: ROOT, detached: true, stdio: ["ignore", log, log] })
  child.unref()
  let died = false
  child.on("exit", () => (died = true))
  return () => died
}

async function start(): Promise<number> {
  if (await isSidecar()) {
    console.log(`already up at ${ADDRESS}`)
    return 0
  }
  const [pid] = listeners()
  if (pid) {
    console.error(`port ${PORT} is held by pid ${pid}, which is not the sidecar: ${holderOf(pid)}`)
    return 1
  }
  if (!existsSync(NUXT)) {
    console.error(`nuxt is not installed in ${ROOT}; run pnpm install there first`)
    return 1
  }
  if (isInstalled() && !(isLoaded() ? launchctl("kickstart", SERVICE) : launchctl("bootstrap", DOMAIN, AGENT))) return 1
  const hasDied = isInstalled() ? () => false : spawnServer()
  if (await waitUntilUp(hasDied)) {
    console.log(`up at ${ADDRESS}`)
    return 0
  }
  console.error(`it did not come up; the log is ${LOG}`)
  return 1
}

async function stop(): Promise<number> {
  const [pid] = listeners()
  if (!pid) {
    console.log("already down")
    return 0
  }
  if (!(await isSidecar())) {
    console.error(`port ${PORT} is held by pid ${pid}, which is not the sidecar, so it stays: ${holderOf(pid)}`)
    return 1
  }
  const tree = serverTree(pid)
  signal(tree, "SIGTERM")
  for (const end = Date.now() + 10_000; listeners().length && Date.now() < end; ) await sleep(200)
  signal(tree, "SIGKILL")
  console.log("stopped")
  return 0
}

function plist(): string {
  const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const string = (text: string): string => `<string>${escape(text)}</string>`
  const env = Object.entries({ PATH: process.env.PATH, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR })
    .flatMap(([key, value]) => (value ? [`<key>${key}</key>${string(value)}`] : []))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${string(LABEL)}
  <key>ProgramArguments</key>
  <array>${[process.execPath, NUXT, "dev", "--port", PORT].map(string).join("")}</array>
  <key>WorkingDirectory</key>${string(ROOT)}
  <key>EnvironmentVariables</key>
  <dict>${env.join("")}</dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key>${string(LOG)}
  <key>StandardErrorPath</key>${string(LOG)}
</dict>
</plist>
`
}

async function install(): Promise<number> {
  if (!existsSync(NUXT)) {
    console.error(`nuxt is not installed in ${ROOT}; run pnpm install there first`)
    return 1
  }
  if (isLoaded()) launchctl("bootout", SERVICE)
  // A sidecar started by hand holds the port the login one needs.
  if (listeners().length && (await stop()) !== 0) return 1
  mkdirSync(dirname(AGENT), { recursive: true })
  mkdirSync(modeHome(), { recursive: true })
  writeFileSync(AGENT, plist())
  if (!launchctl("bootstrap", DOMAIN, AGENT)) return 1
  if (!(await waitUntilUp())) {
    console.error(`installed, but it did not come up; the log is ${LOG}`)
    return 1
  }
  console.log(`installed: up at ${ADDRESS}, and it starts at every login (${AGENT})`)
  return 0
}

function uninstall(): number {
  if (!isInstalled()) {
    console.log("not installed")
    return 0
  }
  if (isLoaded()) launchctl("bootout", SERVICE)
  rmSync(AGENT)
  console.log("uninstalled: stopped, and it no longer starts at login")
  return 0
}

function installedApp(): string | undefined {
  const dir = join(homedir(), "Applications", "Chrome Apps.localized")
  if (!existsSync(dir)) return undefined
  // Found by the start URL its Chrome shim records, so renaming the app at install time does not lose it.
  return readdirSync(dir)
    .filter(name => name.endsWith(".app"))
    .map(name => join(dir, name))
    .find(app => {
      const plistPath = join(app, "Contents", "Info.plist")
      const { stdout } = spawnSync("plutil", ["-extract", "CrAppModeShortcutURL", "raw", "-o", "-", plistPath], { encoding: "utf8" })
      return stdout.trim() === `${ADDRESS}/`
    })
}

async function listenersAfterPointing(key: string): Promise<number> {
  const reply = await fetch(`${ADDRESS}/api/follow`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, source: "claude" }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined)
  if (!reply?.ok) return 0
  const { listeners } = (await reply.json().catch(() => ({}))) as { listeners?: number }
  return listeners ?? 0
}

async function open(key = process.env.CLAUDE_CODE_SESSION_ID?.slice(0, 8)): Promise<number> {
  if (!(await isSidecar()) && (await start()) !== 0) return 1
  if (key && (await listenersAfterPointing(key))) {
    console.log(`moved the open sidecar to conversation ${key}`)
    return 0
  }
  // The installed app opens on its home, which follows the point just made.
  const app = installedApp()
  if (app && spawnSync(OPEN, [app]).status === 0) {
    console.log(`opened the ${basename(app, ".app")} app`)
    return 0
  }
  const page = key ? `${ADDRESS}/c/${key}` : `${ADDRESS}/`
  // -n hands --app to a Chrome that is already running; without it the flag is dropped.
  if (spawnSync(OPEN, ["-na", "Google Chrome", "--args", `--app=${page}`]).status === 0) {
    console.log(`opened ${page} in a Chrome app window`)
    return 0
  }
  if (spawnSync(OPEN, [page]).status === 0) {
    console.log(`opened ${page} in the browser`)
    return 0
  }
  console.error(`could not open ${page}`)
  return 1
}

const COMMANDS = {
  open: async () => open(process.argv[3]),
  status,
  start,
  stop,
  restart: async () => ((await stop()) === 0 ? start() : 1),
  install,
  uninstall: async () => uninstall(),
  help: async () => (console.log(USAGE), 0),
} satisfies Record<Command, () => Promise<number>>

const asked = process.argv[2] ?? "open"
const run = Object.hasOwn(COMMANDS, asked) ? COMMANDS[asked as Command] : undefined
if (!run) {
  console.error(`sidecar: no command '${asked}'\n\n${USAGE}`)
  process.exit(2)
}
process.exit(await run())
