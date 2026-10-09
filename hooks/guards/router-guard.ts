import { basename } from "node:path"
import { armed } from "../../lib/hook/guard.ts"
import { deny, payload, record, str } from "../../lib/hook/io.ts"
import { held } from "../../lib/mode/state.ts"

const TOOLS = new Set(["Write", "Edit", "NotebookEdit"])

// Both modes route work to somebody else, so each gets its own reason for the same denial.
const REASONS: Record<string, (name: string, path: string) => string> = {
  swarm: (name, path) =>
    `Swarm routes, it does not build, and ${name} is a domain rather than a seam. Hand it to the ` +
    "owner who already holds those files, or hire one with a charter naming the working " +
    "directory, the files it owns, the files it must not touch and how to report back. " +
    "Writing it yourself is how the fleet becomes decoration and the parallelism becomes " +
    "theatre. The board is yours to write through TaskCreate and TaskUpdate, which this " +
    "never blocks. Genuinely a two-line seam between two finished domains? Say so and " +
    `leave ${name} to the owner of one of them. Target: ${path}`,
  dispatcher: (name, path) =>
    `Dispatcher explores and dispatches, it never writes, and ${name} is not yours to change. ` +
    "Put the change in the prompt for the session that owns that repo, and let that session " +
    "write it. The board is yours through TaskCreate and TaskUpdate, which this never blocks. " +
    `Target: ${path}`,
}

if (armed()) {
  try {
    const data = payload()
    // agent_id is set only inside a subagent call; the router's own calls carry none and stay denied.
    if (data && !data.agent_id) {
      const mode = TOOLS.has(str(data.tool_name)) ? held("mode", str(data.session_id) || undefined) : ""
      const reason = Object.hasOwn(REASONS, mode) ? REASONS[mode] : undefined
      if (reason) {
        const path = str(record(data.tool_input).file_path) || "the file"
        deny(reason(basename(path), path))
      }
    }
  } catch {}
}
