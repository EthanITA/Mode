import { basename, extname } from "node:path"
import { armed } from "../../lib/hook/guard.ts"
import { payload, postContext, record, str } from "../../lib/hook/io.ts"
import { head, quote, strip, WORD } from "../../lib/text.ts"

const TYPED = new Set([".ts", ".tsx", ".mts", ".cts", ".vue", ".js", ".jsx", ".mjs", ".cjs"])

// The rule exempts external contracts, and these are where they live.
const EXTERNAL_PATH = /(^|\/)(drizzle|migrations?|generated|__generated__)\/|\.(gen|generated|d)\.ts$|schema\.ts$/
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

function offenders(added: string): string[] {
  const findings: string[] = []
  added.split("\n").forEach((raw, index) => {
    if (EXTERNAL_LINE.test(raw)) return
    const line = raw.replace(COMMENT, "").replace(STRINGS, '""')
    const hit = CHECKS.find(([pattern]) => pattern.test(line))
    if (hit) findings.push(`line ${index + 1} ${quote(head(strip(raw), 70))} → ${hit[1]}`)
  })
  return findings
}

function check(): void {
  const data = payload()
  if (!data) return
  const input = record(data.tool_input)
  const path = str(input.file_path)
  if (!TYPED.has(extname(path).toLowerCase()) || EXTERNAL_PATH.test(path)) return

  const findings = offenders(str(input.content) || str(input.new_string))
  if (!findings.length) return
  postContext(
    `null-guard on ${basename(path)} — ${findings.join("; ")}\n\nThe rule this guard enforces: \`undefined\`, not ` +
      '`null`, for "no value" — return types, refs, optional fields. A helper you author ' +
      "returning `Promise<T | null>` is wrong; return `Promise<T | undefined>`. Optionality is " +
      "`?:` and nothing else. Never test absence by comparison.\n\n`null` is allowed only where an " +
      "external contract demands it — DB columns, foreign JSON, drizzle inserts. If that is the " +
      "case here, say so on the line with an `external contract` comment; otherwise fix it now. " +
      "Do not narrate the check itself; if you revise, say what changed in a clause.",
  )
}

if (armed()) {
  try {
    check()
  } catch {}
}
