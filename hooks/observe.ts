import * as Artifacts from "../lib/artifact/store.ts"
import { newsLine } from "../lib/hook/board.ts"
import { context, payload, record, str, type Payload } from "../lib/hook/io.ts"
import { deliverableCommand } from "../lib/mode/deliverable.ts"
import { done } from "../lib/mode/slots.ts"

const TESTS =
  /\b(pytest|jest|vitest|rspec|phpunit|tox|nose2|(go|cargo|mvn|gradle|swift|dotnet)\s+test|(npm|yarn|pnpm|bun|deno)\s+(run\s+)?test|tests?\/run\.py|make\s+(test|check))\b/
const COMMIT = /\bgit\s+(commit|cherry-pick)\b/
// The two delivery acts that finish one part of the north star outright: the MR opened, the page stamped.
const RECEIPTS: [RegExp, string][] = [
  [/\b(?:glab\s+mr\s+create|gh\s+pr\s+create)\b/, "change"],
  [/\bartifact\s+stamp\b/, "artifact"],
]
const MR_TOOL = /^mcp__.+__create_(?:merge_request|pull_request)$/
// Only at the top of the folder: a .md one level down is a page's build brief, not an artifact.
const ARTIFACT_MD = /\/artifacts\/[^/]+\.md$/

// Each step stands alone, the way it did when each was its own process: one failing never stops the next.
async function quietly(step: () => unknown): Promise<void> {
  try {
    await step()
  } catch {}
}

// The step event a tool call just satisfied, read off the call rather than off a claim.
function observed(data: Payload): string {
  const tool = str(data.tool_name)
  const args = record(data.tool_input)
  const failed = data.hook_event_name === "PostToolUseFailure"
  if (tool === "AskUserQuestion") return failed ? "" : "question"
  if (tool === "Agent") return failed ? "" : "agent"
  if (tool === "Artifact") return failed ? "" : "artifact"
  if (["Write", "Edit", "NotebookEdit"].includes(tool)) {
    const path = str(args.file_path)
    const made = path.includes("/artifacts/") && (path.endsWith(".html") || ARTIFACT_MD.test(path))
    return !failed && made ? "artifact" : ""
  }
  if (tool !== "Bash") return ""
  const command = str(args.command)
  if (COMMIT.test(command)) return failed ? "" : "commit"
  // A suite that went red is its own event, which is what a red-first pipeline waits on.
  if (TESTS.test(command)) return failed ? "test-fail" : "test"
  return ""
}

// lib/artifact is the one writer of a conversation's list, as lib/mode is of its slots.
function recordDocument(data: Payload): void {
  const path = str(record(data.tool_input).file_path)
  const session = str(data.session_id)
  if (data.hook_event_name !== "PostToolUse" || !["Write", "Edit"].includes(str(data.tool_name))) return
  if (!path.endsWith(".md") || !session) return
  try {
    Artifacts.record(Artifacts.entryOf(Artifacts.resolve(path, session)), session)
  } catch {}
}

try {
  const data = payload() ?? {}
  const session = str(data.session_id) || undefined
  const token = observed(data)
  if (token) await quietly(() => done({ axis: "mode", session, reason: token }))
  recordDocument(data)

  if (data.hook_event_name === "PostToolUse" && !data.agent_id) {
    const command = data.tool_name === "Bash" ? str(record(data.tool_input).command) : ""
    const parts = RECEIPTS.filter(([pattern]) => pattern.test(command)).map(([, part]) => part)
    if (MR_TOOL.test(str(data.tool_name))) parts.push("change")
    for (const part of parts) await quietly(() => deliverableCommand({ words: ["done", part], session }))
  }

  // Only on the success event: a failed call already owes the model an error, not a board aside.
  if (data.hook_event_name === "PostToolUse") {
    const board = newsLine(str(data.session_id))
    if (board) context("PostToolUse", board)
  }
} catch {}
