import { closeSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { basename } from "node:path"

type StatusLine = { kind: "MISSING" | "INVALID" | "ABSENT" } | { kind: "PRESENT"; command: string }

// Interpreters come first in a statusLine command, so taking the first existing path once appended a shell block to node itself.
const INTERPRETERS = new Set([
  "env", "nice", "nohup", "sudo", "time",
  "node", "nodejs", "bun", "deno", "tsx", "ts-node",
  "python", "python2", "python3", "pypy", "pypy3",
  "ruby", "perl", "php", "lua",
  "bash", "sh", "zsh", "ksh", "dash", "fish", "awk", "gawk",
])
const VERSIONED = ["python", "node", "pypy", "ruby", "perl", "php"]
const SHELL_BANGS = ["/sh", "/bash", "/zsh", " env sh", " env bash", " env zsh"]

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function readSettings(path: string): Record<string, unknown> | "MISSING" | "INVALID" {
  if (!isFile(path) || statSync(path).size === 0) return "MISSING"
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
    return typeof parsed === "object" && parsed && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : "INVALID"
  } catch {
    return "INVALID"
  }
}

function statusLine(path: string): StatusLine {
  const settings = readSettings(path)
  if (settings === "MISSING" || settings === "INVALID") return { kind: settings }
  const line = settings.statusLine
  if (!line) return { kind: "ABSENT" }
  if (typeof line === "string") return { kind: "PRESENT", command: line }
  const command = typeof line === "object" ? (line as Record<string, unknown>).command : undefined
  return { kind: "PRESENT", command: typeof command === "string" ? command : "" }
}

// Writes through the path rather than replacing it, so a symlinked settings.json stays a link.
function setStatusLine(path: string, command: string): void {
  const settings = readSettings(path)
  if (settings === "INVALID") throw new Error(`${path} is not a JSON object`)
  const next = { ...(settings === "MISSING" ? {} : settings), statusLine: { type: "command", command } }
  writeFileSync(path, JSON.stringify(next, undefined, 2) + "\n")
  JSON.parse(readFileSync(path, "utf8"))
}

function shellWords(line: string): string[] | undefined {
  const words: string[] = []
  let word = ""
  let started = false
  let quote: "'" | '"' | undefined
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote === "'") {
      if (c === "'") quote = undefined
      else word += c
    } else if (quote === '"') {
      if (c === '"') quote = undefined
      else if (c === "\\" && (line[i + 1] === '"' || line[i + 1] === "\\")) word += line[++i]
      else word += c
    } else if (c === "'" || c === '"') {
      quote = c
      started = true
    } else if (c === "\\") {
      if (i + 1 >= line.length) return undefined
      word += line[++i]
      started = true
    } else if (" \t\r\n".includes(c)) {
      if (started) words.push(word)
      word = ""
      started = false
    } else {
      word += c
      started = true
    }
  }
  if (quote) return undefined
  if (started) words.push(word)
  return words
}

function isInterpreter(arg: string): boolean {
  const base = basename(arg).toLowerCase()
  if (INTERPRETERS.has(base)) return true
  return VERSIONED.some((prefix) => base.startsWith(prefix) && !/^\p{L}/u.test(base.slice(prefix.length)))
}

function scriptOf(command: string): string | undefined {
  const words = shellWords(command) ?? command.split(/\s+/).filter(Boolean)
  return words.find((word) => isFile(word) && !isInterpreter(word))
}

function isShellScript(path: string): boolean {
  let head: Buffer
  try {
    const fd = openSync(path, "r")
    const buffer = Buffer.alloc(8192)
    head = buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, 0))
    closeSync(fd)
  } catch {
    return false
  }
  if (head.includes(0)) return false
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(head)
  } catch {
    return false
  }
  if (path.endsWith(".sh")) return true
  const first = text.trimStart().split("\n", 1)[0]
  return first.startsWith("#!") && SHELL_BANGS.some((token) => first.includes(token))
}

function realpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const [verb, ...args] = process.argv.slice(2)
switch (verb) {
  case "statusline": {
    const line = statusLine(args[0])
    console.log(line.kind === "PRESENT" ? `PRESENT\n${line.command}` : line.kind)
    break
  }
  case "set-statusline":
    setStatusLine(args[0], args[1])
    break
  case "script-of": {
    const script = scriptOf(args[0])
    if (script) console.log(script)
    break
  }
  case "is-shell":
    process.exit(isShellScript(args[0]) ? 0 : 1)
  case "realpath":
    console.log(realpath(args[0]))
    break
  default:
    console.error(`_install.ts: unknown verb ${verb ?? "(none)"}. Known: statusline, set-statusline, script-of, is-shell, realpath`)
    process.exit(2)
}
