import { basename, extname } from "node:path"
import { armed } from "../../lib/hook/guard.ts"
import { payload, postContext, record, str } from "../../lib/hook/io.ts"
import { offenders, TYPED } from "../../lib/style/namespaces.ts"
import { readText } from "../../lib/text.ts"

function check(): void {
  const data = payload()
  if (!data) return
  const path = str(record(data.tool_input).file_path)
  if (!TYPED.has(extname(path).toLowerCase())) return

  // The whole file, not the edit: a sibling added beside an existing export is the case that matters.
  const findings = offenders(readText(path))
  if (!findings.length) return
  postContext(
    `namespace-guard on ${basename(path)}: ${findings.join("; ")}\n\nThe rule this guard enforces: every top-level export is a tax ` +
      "on every keystroke. A shared prefix is a namespace asking to exist: collapse it before the " +
      "second export, split the domain by concern behind one curated index.ts that names what it " +
      "exports (an allowlist, never `export *`), and name it after the capability you own, not the " +
      "vendor you rent. Stop before ceremony: a lone function needs none, two levels is the " +
      "ceiling.\n\nFix it now. Do not narrate the check itself; if you revise, say what changed in " +
      "a clause.",
  )
}

if (armed()) {
  try {
    check()
  } catch {}
}
