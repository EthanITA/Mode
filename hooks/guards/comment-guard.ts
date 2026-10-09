import { basename, extname } from "node:path"
import { armed } from "../../lib/hook/guard.ts"
import { payload, postContext, record, str } from "../../lib/hook/io.ts"
import { blocksIn, markerOf, opensWithHeader, verdicts } from "../../lib/style/comments.ts"
import { strip } from "../../lib/text.ts"

function check(): void {
  const data = payload()
  if (!data) return
  const input = record(data.tool_input)
  const path = str(input.file_path)
  const marker = markerOf(extname(path).toLowerCase())
  if (!marker) return

  const added = str(input.content) || str(input.new_string)
  if (!strip(added)) return

  const blocks = blocksIn(added, marker)
  if (!blocks.length) return

  const wholeFile = data.tool_name === "Write"
  const findings = verdicts(blocks, wholeFile && opensWithHeader(added, marker), wholeFile)
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
