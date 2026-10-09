import { basename } from "node:path"
import { armed } from "../../lib/hook/guard.ts"
import { payload, postContext, record, str } from "../../lib/hook/io.ts"
import { head, quote, readText, strip, WORD } from "../../lib/text.ts"

const TELLS: [string, RegExp][] = [
  ["dated entry", /20[0-9]{2}-[0-9]{2}-[0-9]{2}/g],
  ["clock time", new RegExp(String.raw`(?<!${WORD})[0-2]?[0-9]:[0-5][0-9](?!${WORD})`, "gu")],
  ["commit hash", /`(?=[0-9a-f]{7,40}`)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}`/g],
  [
    "verification claim",
    new RegExp(
      String.raw`\((?:verified|audited|reproduced|tested|confirmed)(?!${WORD})|(?<!${WORD})(?:verified|audited|reproduced|last verified)\s+(?:on |in )?20[0-9]{2}`,
      "giu",
    ),
  ],
  ["exit code", new RegExp(String.raw`(?<!${WORD})exits? [=0-9]|exit=[0-9]`, "gu")],
  [
    "point-in-time phrasing",
    new RegExp(String.raw`(?<!${WORD})(?:(?:as of|currently|right now|at the moment)(?!${WORD})|for now, (?=${WORD}))`, "giu"),
  ],
  ["scratch path", /\/private\/tmp\/|\/var\/folders\//g],
  ["merge request ref", new RegExp(String.raw`![0-9]{1,5}(?!${WORD})`, "gu")],
  ["session id", new RegExp(String.raw`(?<!${WORD})[0-9a-f]{8}-[0-9a-f]{4}-`, "gu")],
]

const BULLET = /^\s*(?:[-*+]\s+|\p{Nd}+\.\s+)/u
// A single long rule is fine; several bullets at once is a dump.
const MAX_BULLETS = 3
const MAX_CHARS = 1600

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "is", "it", "that", "this", "for", "on", "not", "be", "as", "with", "you", "i", "my", "me"])
// Overlap against the smaller line: Jaccard sinks exactly when a reworded duplicate is worst.
const NEAR_DUPLICATE = 0.65

type Duplicate = { score: number; line: string; other: string }

function tokens(line: string): Set<string> {
  return new Set((line.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => !STOPWORDS.has(word) && word.length > 2))
}

// Half to even, as Python's round() does, so a 62.5% overlap still reads 62%.
function roundEven(value: number): number {
  const rounded = Math.round(value)
  return Math.abs(value % 1) === 0.5 ? 2 * Math.round(value / 2) : rounded
}

// A duplicated rule is still in the file after the write, so each added line is compared against every other line.
function nearDuplicate(addedLines: string[], fileLines: string[]): Duplicate | undefined {
  let best: Duplicate | undefined
  const addedSet = new Set(addedLines.map(strip))
  for (const line of addedLines) {
    const mine = tokens(line)
    if (mine.size < 5) continue
    for (const other of fileLines) {
      const trimmed = strip(other)
      // An Edit anchors on existing text, so a line the file merely extends is context, not a new rule.
      if (addedSet.has(trimmed) || Array.from(trimmed).length < 20 || trimmed.startsWith(strip(line))) continue
      const theirs = tokens(other)
      if (!theirs.size) continue
      const shared = [...mine].filter((word) => theirs.has(word)).length
      const score = shared / Math.min(mine.size, theirs.size)
      if (score >= NEAR_DUPLICATE && (!best || score > best.score)) best = { score, line: strip(line), other: trimmed }
    }
  }
  return best
}

function fileLinesOf(path: string): string[] {
  try {
    return readText(path).split("\n").filter((line) => strip(line))
  } catch {
    return []
  }
}

function check(): void {
  const data = payload()
  if (!data) return
  const input = record(data.tool_input)
  const path = str(input.file_path)
  const name = basename(path)
  if (!(name === "CLAUDE.md" || name === "preferences.md" || /\/\.claude\/rules\/[^/]+\.md$/.test(path))) return

  const added = str(input.content) || str(input.new_string)
  if (!strip(added)) return

  const findings: string[] = []
  for (const [label, pattern] of TELLS) {
    const hits = added.match(pattern) ?? []
    if (hits.length) findings.push(`${hits.length}x ${label} (${hits.slice(0, 2).map((hit) => head(quote(hit), 24)).join(", ")})`)
  }

  const addedLines = added.split("\n").filter((line) => strip(line))

  // A Write's size measures the file's job, not the addition: PostToolUse cannot see the previous version.
  if (data.tool_name !== "Write") {
    const bullets = addedLines.filter((line) => BULLET.test(line))
    if (bullets.length > MAX_BULLETS) findings.push(`${bullets.length} new bullets in one edit — a rule is a line, not a list`)
    const size = Array.from(added).length
    if (size >= MAX_CHARS) findings.push(`${size} chars in one edit`)
  }

  const fileLines = fileLinesOf(path)
  const duplicate = nearDuplicate(addedLines, fileLines)
  if (duplicate) {
    findings.push(
      `${roundEven(duplicate.score * 100)}% overlap with a rule already in the file — ` +
        `${quote(head(duplicate.line, 70))} already says ${quote(head(duplicate.other, 70))}`,
    )
  }
  if (!findings.length) return

  const advice = duplicate
    ? "Consolidate instead of appending a second copy — and if a rule is already there and still did not bind, " +
      "the fix is a mechanism, not another sentence."
    : "A durable file holds only what changes future behaviour. For every line you just added: would a " +
      "future session act differently because of it? If not, it belonged in the reply. Never durable: " +
      "verification receipts, exit codes, dated inventories, commit hashes, incident logs, one-off decisions."
  postContext(
    `memory-guard on ${name} (${fileLines.length} lines) — ${findings.join("; ")}\n\n${advice}\n\nCut it down now. ` +
      "Do not narrate the check itself; if you revise, say what changed in a clause.",
  )
}

if (armed()) {
  try {
    check()
  } catch {}
}
