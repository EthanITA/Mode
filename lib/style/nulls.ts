import { head, quote, strip, WORD } from "../text.ts"

export const TYPED = new Set([".ts", ".tsx", ".mts", ".cts", ".vue", ".js", ".jsx", ".mjs", ".cjs"])

// The rule exempts external contracts, and these are where they live.
export const EXTERNAL_PATH = /(^|\/)(drizzle|migrations?|generated|__generated__)\/|\.(gen|generated|d)\.ts$|schema\.ts$/
const EXTERNAL_LINE = /external contract/i

const STRINGS = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g
const COMMENT = /\/\/.*$|\/\*[\s\S]*?\*\//gm

// Built from template strings, which the masking below blanks, so this file never trips its own checks.
const CHECKS: [RegExp, string][] = [
  [
    new RegExp(String.raw`(?<!${WORD})ref\s*<[^>]*\|\s*null[^>]*>`, "u"),
    "nullable ref — `ref<T>()` is already `T | undefined`, so `ref<T | null>(null)` adds a second empty value",
  ],
  [
    new RegExp(String.raw`\?\s*:\s*[^;,\n=]*\|\s*(?:null|undefined)(?!${WORD})`, "u"),
    "`?:` already means optional — `?: T | null` and `?: T | undefined` say it twice",
  ],
  [
    new RegExp(String.raw`^\s*(?:readonly\s+)?[A-Za-z_$][\p{L}\p{N}_$]*\s*:\s*[^;,\n=()]*\|\s*undefined(?!${WORD})`, "mu"),
    "optionality is `?:` and nothing else — `quantity?: number`, never `quantity: number | undefined`",
  ],
  [
    new RegExp(String.raw`\|\s*null(?!${WORD})|(?<!${WORD})null\s*\|`, "u"),
    "a type you author should not union `null` — `undefined` is the absent value",
  ],
  [
    new RegExp(String.raw`(?:[!=]==?\s*(?:null|undefined)(?!${WORD}))|(?:(?<!${WORD})(?:null|undefined)\s*[!=]==?)`, "u"),
    'absence is `!x` / `!!x` / `Boolean(x)`, never a comparison — needing `0` or `""` to survive means the field wants a real default',
  ],
]

export function offenders(added: string): string[] {
  const findings: string[] = []
  added.split("\n").forEach((raw, index) => {
    if (EXTERNAL_LINE.test(raw)) return
    const line = raw.replace(COMMENT, "").replace(STRINGS, '""')
    const hit = CHECKS.find(([pattern]) => pattern.test(line))
    if (hit) findings.push(`line ${index + 1} ${quote(head(strip(raw), 70))} → ${hit[1]}`)
  })
  return findings
}
