import { basename, extname } from "node:path"
import { armed } from "../../lib/hook/guard.ts"
import { payload, postContext, record, str } from "../../lib/hook/io.ts"
import { head, quote, strip, words } from "../../lib/text.ts"

const SLASH = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".go", ".rs", ".java", ".swift", ".kt", ".c", ".h", ".cpp"])
const HASH = new Set([".py", ".sh", ".bash", ".zsh", ".rb"])

// A WHY that needs more than this has stopped being a note and become prose.
const MAX_BLOCK_LINES = 2
const MAX_WORDS = 28
// Two short notes is the WHY exemption; a third is a habit.
const QUIET_BLOCKS = 2

// Directives and deprecation markers are not prose.
const EXEMPT = /eslint-|@ts-|prettier-ignore|noqa|type:\s*ignore|pylint:|flake8:|shellcheck|biome-ignore|DEPRECATED|^#!/i
const STRINGS = /https?:\/\/[^\s"'`]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g
const MARKER = /^\s*(?:\/\/+|#+|\/\*+|\*+)\s*/

// Consecutive comment-only lines are one block, because three stacked // lines are one paragraph to a reader.
function blocksIn(text: string, marker: string): string[][] {
  const found: string[][] = []
  let current: string[] = []
  for (const raw of text.split("\n")) {
    const line = strip(raw.replace(STRINGS, ""))
    const isComment = line.startsWith(marker) || (marker === "//" && line.startsWith("/*"))
    if (isComment && !EXEMPT.test(line)) {
      current.push(strip(raw))
    } else if (current.length) {
      found.push(current)
      current = []
    }
  }
  if (current.length) found.push(current)
  return found
}

function verdicts(blocks: string[][], header: boolean, wholeFile: boolean): string[] {
  const out: string[] = []
  if (header) out.push("it opens with a file-header comment — banned outright")
  for (const block of blocks) {
    const count = words(block.map((line) => line.replace(MARKER, "")).join(" ")).length
    const first = quote(head(block[0] ?? "", 60))
    if (block.length > MAX_BLOCK_LINES) out.push(`${block.length}-line comment ${first} — a WHY fits in one line, two at most`)
    else if (count > MAX_WORDS) out.push(`${count}-word comment ${first} — say it shorter or not at all`)
  }
  // Density counts on an Edit, which appends; a Write's total says nothing about restraint.
  if (!wholeFile && blocks.length > QUIET_BLOCKS) out.push(`${blocks.length} separate comments in one edit — the default is zero`)
  return out
}

function check(): void {
  const data = payload()
  if (!data) return
  const input = record(data.tool_input)
  const path = str(input.file_path)
  const extension = extname(path).toLowerCase()
  const marker = SLASH.has(extension) ? "//" : HASH.has(extension) ? "#" : undefined
  if (!marker) return

  const added = str(input.content) || str(input.new_string)
  if (!strip(added)) return

  const blocks = blocksIn(added, marker)
  if (!blocks.length) return

  // A header sits before any code, so only the first real line counts.
  const wholeFile = data.tool_name === "Write"
  let header = false
  if (wholeFile) {
    const [opening] = added.split("\n").filter((line) => strip(line) && !line.startsWith("#!")).map(strip)
    header = !!opening && (opening.startsWith(marker) || opening.startsWith("/*")) && !EXEMPT.test(opening)
  }

  const findings = verdicts(blocks, header, wholeFile)
  if (!findings.length) return
  postContext(
    `comment-guard on ${basename(path)} — ${findings.join("; ")}\n\nThe rule this guard enforces: comment WHY, ` +
      "never WHAT, and say it in one line. Default is zero comments. Banned outright: file-header " +
      "blurbs, usage blocks, docstrings restating the signature, and anything describing what the " +
      "code does.\n\nA comment survives only if the logic is genuinely non-obvious, or the code " +
      "deliberately diverges from expectation for a specific reason — a hidden constraint, a " +
      "linked workaround, a rejected alternative. Even then it earns one line.\n\nCut what fails " +
      "that test now. Do not narrate the check itself; if you revise, say what changed in a clause.",
  )
}

if (armed()) {
  try {
    check()
  } catch {}
}
