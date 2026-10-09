import { readFileSync } from "node:fs"

// Python's whitespace, which JS's \s misses at \x1c-\x1f and \x85 and widens with ﻿.
const SPACE = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000"
const EDGES = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, "g")
const RUN = new RegExp(`[${SPACE}]+`)
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u

// Python's \w, for a word edge that counts `é` as a letter where JS's ASCII \b would not; needs the u flag.
export const WORD = String.raw`[\p{L}\p{N}_]`

export function strip(text: string): string {
  return text.replace(EDGES, "")
}

export function words(text: string): string[] {
  return text.split(RUN).filter(Boolean)
}

// Counted in code points, so an emoji is never cut in half.
export function head(text: string, count: number): string {
  return Array.from(text).slice(0, count).join("")
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
