import { readFileSync } from "node:fs"

// Python's whitespace, which JS's \s misses at \x1c-\x1f and \x85 and widens with the byte order mark.
const SPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000"
const EDGES = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "g")
const LEAD = new RegExp(`^[${SPACE}]+`)
const RUN = new RegExp(`[${SPACE}]+`)
const BREAKS = new RegExp("\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]")
const NON_ASCII = new RegExp("[\\x80-\\uffff]", "g")
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u

// Python's \w, for a word edge that counts `é` as a letter where JS's ASCII \b would not; needs the u flag.
export const WORD = String.raw`[\p{L}\p{N}_]`

export function strip(text: string): string {
  return text.replace(EDGES, "")
}

export function lstrip(text: string): string {
  return text.replace(LEAD, "")
}

// Python's splitlines: every line break it knows, and no empty line after a trailing newline.
export function lines(text: string): string[] {
  const out = text.split(BREAKS)
  if (out.at(-1) === "") out.pop()
  return out
}

// Only \r\n, \r and \n, unlike lines(): a JSONL record can carry a raw U+2028 inside one of its strings.
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

// Python's json.dumps layout, `", "` and `": "` or indented, so a file python wrote and node rewrites does not churn.
export function pyJson(value: unknown, ascii = true, indent = 0, depth = 0): string {
  const inner = indent ? `\n${" ".repeat(indent * (depth + 1))}` : ""
  const outer = indent ? `\n${" ".repeat(indent * depth)}` : ""
  const sep = indent ? "," : ", "
  if (Array.isArray(value)) {
    return value.length ? `[${inner}${value.map((item) => pyJson(item, ascii, indent, depth + 1)).join(sep + inner)}${outer}]` : "[]"
  }
  if (typeof value === "object" && value) {
    const entries = Object.entries(value).map(([key, item]) => `${pyJson(key, ascii)}: ${pyJson(item, ascii, indent, depth + 1)}`)
    return entries.length ? `{${inner}${entries.join(sep + inner)}${outer}}` : "{}"
  }
  const text = JSON.stringify(value) ?? "null"
  return ascii ? text.replace(NON_ASCII, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`) : text
}

// Python's str() of a JSON value, so a missing field still reads `None` in a message the way it always has.
export function pyStr(value: unknown): string {
  if (value === undefined || value === null) return "None" // external contract: JSON null is Python's None
  if (typeof value === "boolean") return value ? "True" : "False"
  return String(value)
}

// Python's %r of a JSON value: a string quoted the way repr quotes it, anything else as str() writes it.
export function pyRepr(value: unknown): string {
  return typeof value === "string" ? quote(value) : pyStr(value)
}

// Python truthiness, where an empty list or object is false; a receipt declared as `{}` has always meant none.
export function pyTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object" && value) return Object.keys(value).length > 0
  return !!value
}

export function words(text: string): string[] {
  return text.split(RUN).filter(Boolean)
}

// Counted in code points, so an emoji is never cut in half, and stopping there, since a page can be megabytes.
export function head(text: string, count: number): string {
  let seen = 0
  let at = 0
  for (const char of text) {
    if (seen++ === count) return text.slice(0, at)
    at += char.length
  }
  return text
}

// Python's ljust, which counts code points where padEnd counts UTF-16 units.
export function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - Array.from(text).length))
}

function escaped(char: string): string {
  const code = char.codePointAt(0) ?? 0
  const hex = code.toString(16)
  if (code <= 0xff) return `\\x${hex.padStart(2, "0")}`
  return code <= 0xffff ? `\\u${hex.padStart(4, "0")}` : `\\U${hex.padStart(8, "0")}`
}

// Python's repr of a string, so a guard's message quotes text the same way it did before the port.
export function quote(text: string): string {
  const mark = text.includes("'") && !text.includes('"') ? '"' : "'"
  let out = mark
  for (const char of text) {
    if (char === mark || char === "\\") out += `\\${char}`
    else if (char === "\t") out += "\\t"
    else if (char === "\n") out += "\\n"
    else if (char === "\r") out += "\\r"
    else if (char !== " " && UNPRINTABLE.test(char)) out += escaped(char)
    else out += char
  }
  return out + mark
}

// Strict UTF-8 with universal newlines, which is how the python guards read a file: one bad byte and they read nothing.
export function readText(path: string): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path)).replace(/\r\n?/g, "\n")
}
