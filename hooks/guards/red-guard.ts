import { basename, extname, sep } from "node:path"
import { declaring } from "../../lib/hook/declares.ts"
import { armed } from "../../lib/hook/guard.ts"
import { deny, payload, record, str } from "../../lib/hook/io.ts"
import { red } from "../../lib/mode/slots.ts"

const FLAG = "no-code-without-red"
const WRITES = new Set(["Write", "Edit", "NotebookEdit"])

// Behaviour only: refusing prose and config would block the test's own scaffolding.
const CODE = new Set([
  ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte", ".go", ".rs", ".rb",
  ".java", ".kt", ".kts", ".swift", ".php", ".c", ".h", ".cc", ".cpp", ".hpp", ".cs", ".m",
  ".scala", ".ex", ".exs", ".clj", ".dart", ".lua", ".pl", ".sh", ".bash", ".zsh", ".ipynb",
])
const FOLDERS = new Set(["test", "tests", "spec", "specs", "__tests__", "e2e", "it", "integration", "cypress", "features", "testing", "fixtures", "__mocks__"])
const TESTISH = /(^|[._-])(test|tests|spec|specs)([._-]|$)|^conftest$/

const denied = (mode: string, file: string): string =>
  `the '${mode}' mode holds one rule above all others: no implementation line exists before a test that ` +
  `was watched failing for the right reason. ${file} is implementation, and no failing run is on record ` +
  "since the last passing one, so this edit is refused."
const FIX =
  " Write the test, run the suite, and read the failure. Red means the assertion fired: an import " +
  "error, a missing fixture or a typo is a broken test rather than a red one, and the recorder only " +
  "counts a run it saw exit non-zero. Once that run has happened this edit goes through on its own. " +
  "Editing the test itself is never refused, and `/mode off` ends the mode if the rule is wrong here."

// Code that is not itself a test, which is the only kind of file the rule is about.
function implementation(path: string): boolean {
  if (!path) return false
  const ext = extname(basename(path))
  if (!CODE.has(ext.toLowerCase())) return false
  const parts = path.split(sep).map((part) => part.toLowerCase())
  return !parts.some((part) => FOLDERS.has(part)) && !TESTISH.test(basename(path, ext).toLowerCase())
}

// Blind is not guilty: every unreadable input allows.
function verdict(session: string | undefined, path: string): string {
  const mode = declaring(session, FLAG)
  if (!mode || !implementation(path) || red(session)) return ""
  return denied(mode, basename(path)) + FIX
}

if (armed()) {
  try {
    const data = payload()
    if (data && WRITES.has(str(data.tool_name))) {
      const input = record(data.tool_input)
      const reason = verdict(str(data.session_id) || undefined, str(input.file_path) || str(input.notebook_path))
      if (reason) deny(`red-guard — ${reason}`)
    }
  } catch {}
}
