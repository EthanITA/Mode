import assert from "node:assert/strict"
import { join } from "node:path"
import { describe, test } from "node:test"
import { contextOf, env, fire, PLUGIN, scratch, silent, write } from "../support.ts"

const tmp = scratch("mode-writes-")
const vars = env({ CLAUDE_PLUGIN_ROOT: PLUGIN, CLAUDE_CONFIG_DIR: join(tmp, "config") })

// The file is on disk before the hook runs, as it is after a real Write or Edit.
function wrote(guard: string, name: string, text: string, { tool = "Write", file = text }: { tool?: string; file?: string } = {}): string {
  const path = write(join(tmp, name), file)
  const input = tool === "Write" ? { file_path: path, content: text } : { file_path: path, old_string: "", new_string: text }
  return contextOf(fire(`guards/${guard}`, { session_id: "w0000001", hook_event_name: "PostToolUse", tool_name: tool, tool_input: input }, vars))
}

describe("comment-guard", () => {
  const lines = (...rows: string[]): string => rows.join("\n") + "\n"

  test("flags a file header, a comment past two lines or 28 words, and a third comment in one edit", () => {
    assert.match(wrote("comment-guard", "header.ts", lines("// Utilities for orders.", "export const a = 1")), /file-header comment/)
    assert.match(wrote("comment-guard", "long.ts", lines("const a = 1", "// one", "// two", "// three", "const b = 2"), { tool: "Edit" }), /3-line comment/)
    const wordy = `// ${"word ".repeat(30).trim()}`
    assert.match(wrote("comment-guard", "wordy.ts", lines("const a = 1", wordy), { tool: "Edit" }), /30-word comment/)
    assert.match(wrote("comment-guard", "dense.py", lines("a = 1", "# why one", "b = 2", "# why two", "c = 3", "# why three"), { tool: "Edit" }), /3 separate comments/)
  })

  test("leaves directives, comment markers inside strings, prose files and two short notes alone", () => {
    const quiet = [
      wrote("comment-guard", "directives.ts", lines("// eslint-disable-next-line", "const a = 1", "// @ts-expect-error", "const b = 2", "// biome-ignore lint", "const c = 3"), { tool: "Edit" }),
      wrote("comment-guard", "strings.ts", lines('const url = "https://example.com/a // b"', "const c = '// not a comment'"), { tool: "Edit" }),
      wrote("comment-guard", "notes.md", lines("// whatever", "// it is markdown", "// three")),
      wrote("comment-guard", "two.ts", lines("const a = 1", "// the cap the API enforces", "const b = 2", "// retried because the first call races", "const c = 3"), { tool: "Edit" }),
      wrote("comment-guard", "whole.ts", lines("const a = 1", "// one note", "const b = 2", "// two notes", "const c = 3", "// three notes")),
    ]
    assert.deepEqual(quiet, ["", "", "", "", ""])
  })
})

describe("null-guard", () => {
  test("flags each way an authored type or check reaches for null or a doubled undefined", () => {
    const said = wrote(
      "null-guard",
      "types.ts",
      [
        "const user = ref<User | null>(null)",
        "type A = { name?: string | null }",
        "  quantity: number | undefined",
        "function load(): string | null {}",
        "if (value === null) return",
      ].join("\n"),
      { tool: "Edit" },
    )
    assert.deepEqual([...said.matchAll(/line (\d+) /g)].map((match) => match[1]), ["1", "2", "3", "4", "5"])
  })

  test("an external contract, a generated file, and null inside a string or a comment pass", () => {
    const quiet = [
      wrote("null-guard", "row.ts", "deletedAt: Date | null // external contract: the column is nullable\n", { tool: "Edit" }),
      wrote("null-guard", "drizzle/schema.ts", "deletedAt: Date | null\n"),
      wrote("null-guard", "api.d.ts", "export type A = string | null\n"),
      wrote("null-guard", "masked.ts", 'const doc = "x | null"\n// was: x === null\n', { tool: "Edit" }),
      wrote("null-guard", "script.py", "x: str | None = None\nif x is None: pass\n"),
    ]
    assert.deepEqual(quiet, ["", "", "", "", ""])
  })
})

describe("namespace-guard", () => {
  test("flags siblings sharing a prefix and an export *, reading the whole file rather than the edit", () => {
    const said = wrote("namespace-guard", "google.ts", "export const googleSignout = () => 2\n", {
      tool: "Edit",
      file: "export const googleLogin = () => 1\nexport const googleSignout = () => 2\nexport * from './oauth'\n",
    })
    assert.ok(said.includes("googleLogin") && said.includes("googleSignout") && said.includes("export *"), said)
  })

  test("stays quiet on composables, verb prefixes and a lone namespace", () => {
    const text = "export const useThing = () => 1\nexport const useOther = () => 2\nexport const formatDate = () => 3\nexport const formatMoney = () => 4\nexport const Google = { login: 1 }\n"
    assert.equal(wrote("namespace-guard", "things.ts", text), "")
  })
})

describe("memory-guard, on a durable rule file", () => {
  const rules = (name: string) => join(".claude", "rules", name)

  test("counts the tells of a log entry: dates, hashes, verification claims, exit codes, scratch paths", () => {
    const said = wrote("memory-guard", "CLAUDE.md", "- Fixed on 2026-10-09 in `abc1234f` (verified), the job exits 0 from /private/tmp/x as of today\n", { tool: "Edit" })
    for (const tell of ["dated entry", "commit hash", "verification claim", "exit code", "scratch path", "point-in-time phrasing"]) assert.match(said, new RegExp(tell))
  })

  test("refuses a list dumped in one edit and a near copy of a rule already there", () => {
    const bullets = "- one rule here\n- two rule here\n- three rule here\n- four rule here\n"
    assert.match(wrote("memory-guard", rules("dump.md"), bullets, { tool: "Edit" }), /4 new bullets/)
    const existing = "- Never commit the local settings file, it stays gitignored on every machine.\n"
    const reworded = "- The local settings file is never committed, it stays gitignored on every machine.\n"
    assert.match(wrote("memory-guard", rules("dup.md"), reworded, { tool: "Edit", file: existing + reworded }), /% overlap with a rule already in the file/)
  })

  test("a whole-file write is not judged by size, and a file that is not a rule file is not judged at all", () => {
    const many = "- one rule here\n- two rule here\n- three rule here\n- four rule here\n"
    assert.equal(wrote("memory-guard", rules("fresh.md"), many), "")
    assert.equal(wrote("memory-guard", "notes.md", "- 2026-10-09 shipped `abc1234f`\n", { tool: "Edit" }), "")
  })
})

test("the write guards answer as PostToolUse context, so the note stays visible in the transcript", () => {
  const path = write(join(tmp, "shape.ts"), "// Header.\nexport const a = 1\n")
  const done = fire("guards/comment-guard", { hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: path, content: "// Header.\nexport const a = 1\n" } }, vars)
  assert.ok(!silent(done))
  assert.deepEqual(Object.keys(JSON.parse(done.stdout) as object), ["hookSpecificOutput"])
})
