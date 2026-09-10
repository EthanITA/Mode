import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { conversationOf } from "./conversation.ts"

let root: string
let restore: () => void

before(() => {
  root = mkdtempSync(join(tmpdir(), "sidecar-conversation-"))
  const had = "CLAUDE_CONFIG_DIR" in process.env
  const was = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = root
  restore = () => (had ? (process.env.CLAUDE_CONFIG_DIR = was ?? "") : delete process.env.CLAUDE_CONFIG_DIR)
})

after(() => {
  restore()
  rmSync(root, { recursive: true, force: true })
})

function writeTranscript(key: string, slug: string, lines: Record<string, unknown>[]): void {
  const dir = join(root, "projects", slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${key}-1111-2222-3333-444444444444.jsonl`), `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`)
}

test("a compact summary is a bare note, never the huge body it carries", () => {
  const key = "cccccccc"
  writeTranscript(key, "-tmp-gamma", [
    { type: "user", cwd: "/tmp/gamma", timestamp: "2026-01-01T09:00:00.000Z", message: { role: "user", content: "before" } },
    {
      type: "user",
      cwd: "/tmp/gamma",
      isCompactSummary: true,
      isVisibleInTranscriptOnly: true,
      timestamp: "2026-01-01T09:00:01.000Z",
      message: { role: "user", content: "x".repeat(28000) },
    },
    { type: "user", cwd: "/tmp/gamma", timestamp: "2026-01-01T09:00:02.000Z", message: { role: "user", content: "after" } },
  ])

  const { turns } = conversationOf({ key })
  assert.deepEqual(
    turns.map((turn) => ({ role: turn.role, text: turn.text, kind: turn.kind })),
    [
      { role: "user", text: "before", kind: undefined },
      { role: "system", text: "Compacted", kind: "note" },
      { role: "user", text: "after", kind: undefined },
    ],
  )
})

test("a tool result pairs back to its call by id, carrying the tool name a bare result lacks", () => {
  const key = "eeeeeeee"
  writeTranscript(key, "-tmp-delta2", [
    {
      type: "assistant",
      cwd: "/tmp/delta2",
      timestamp: "2026-01-01T09:00:00.000Z",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_bg1", name: "Bash", input: { command: "sleep 30", run_in_background: true } }],
      },
    },
    {
      type: "user",
      cwd: "/tmp/delta2",
      timestamp: "2026-01-01T09:00:31.000Z",
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_bg1", content: "done" }] },
    },
  ])

  const { turns } = conversationOf({ key })
  assert.deepEqual(
    turns.map((turn) => ({ role: turn.role, kind: turn.kind, tool: turn.tool, ref: turn.ref, bg: turn.bg })),
    [
      { role: "assistant", kind: "acting", tool: "Bash", ref: "toolu_bg1", bg: true },
      { role: "system", kind: "done", tool: "Bash", ref: "toolu_bg1", bg: undefined },
    ],
  )
})

test("a foreground call carries no bg flag", () => {
  const key = "ffffffff"
  writeTranscript(key, "-tmp-delta3", [
    {
      type: "assistant",
      cwd: "/tmp/delta3",
      timestamp: "2026-01-01T09:00:00.000Z",
      message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_fg1", name: "Read", input: { file_path: "/tmp/x" } }] },
    },
  ])

  const { turns } = conversationOf({ key })
  assert.equal(turns[0]?.bg, undefined)
})
