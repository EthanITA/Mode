import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { contextOf, denial, env, fire, PLUGIN, scratch, silent, write } from "../support.ts";

const tmp = scratch("mode-writes-");
const vars = env({ CLAUDE_PLUGIN_ROOT: PLUGIN, CLAUDE_CONFIG_DIR: join(tmp, "config") });

// The file is on disk before the hook runs, as it is after a real Write or Edit.
function wrote(
  guard: string,
  name: string,
  text: string,
  { tool = "Write", file = text }: { tool?: string; file?: string } = {},
): string {
  const path = write(join(tmp, name), file);
  const input =
    tool === "Write" ? { file_path: path, content: text } : { file_path: path, old_string: "", new_string: text };
  return contextOf(
    fire(
      `guards/${guard}`,
      { session_id: "w0000001", hook_event_name: "PostToolUse", tool_name: tool, tool_input: input },
      vars,
    ),
  );
}

describe("comment-guard", () => {
  const lines = (...rows: string[]): string => rows.join("\n") + "\n";
  const refused = (name: string, input: { [key: string]: string }, onDisk?: string): string => {
    const path = join(tmp, name);
    if (onDisk) write(path, onDisk);
    const done = fire(
      "guards/comment-guard",
      {
        session_id: "w0000001",
        hook_event_name: "PreToolUse",
        tool_name: "content" in input ? "Write" : "Edit",
        tool_input: { file_path: path, ...input },
      },
      vars,
    );
    return denial(done) ?? "";
  };

  test("refuses a Write or an Edit that adds a comment before it lands, quoting the comment", () => {
    const header = refused("header.ts", { content: lines("// Utilities for orders.", "export const a = 1") });
    assert.match(header, /'\/\/ Utilities for orders\.'/);
    assert.match(header, /same edit again without those comment lines/);
    assert.match(
      refused(
        "short.py",
        { old_string: "a = 1\n", new_string: lines("a = 1", "# the cap the API enforces") },
        "a = 1\n",
      ),
      /the cap the API enforces/,
    );
    assert.match(
      refused("rewrite.ts", { content: lines("const a = 1", "// one note", "const b = 2") }, lines("const a = 1")),
      /one note/,
    );
  });

  test("lets through directives, comment markers inside strings, prose files and comments the file already has", () => {
    const capped = lines("// the cap the API enforces", "const a = 1", "const b = 2");
    const quiet = [
      refused("directives.ts", {
        old_string: "",
        new_string: lines("// eslint-disable-next-line", "const a = 1", "// @ts-expect-error", "// biome-ignore lint"),
      }),
      refused("strings.ts", {
        old_string: "",
        new_string: lines('const url = "https://example.com/a // b"', "const c = '// not a comment'"),
      }),
      refused("notes.md", { content: lines("// whatever", "// it is markdown") }),
      refused(
        "carried.ts",
        {
          old_string: lines("// the cap the API enforces", "const a = 1"),
          new_string: "// the cap the API enforces\n",
        },
        capped,
      ),
      refused("moved.ts", { content: lines("const b = 2", "// the cap the API enforces", "const a = 1") }, capped),
    ];
    assert.deepEqual(quiet, ["", "", "", "", ""]);
  });
});

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
    );
    assert.deepEqual(
      [...said.matchAll(/line (\d+) /g)].map((match) => match[1]),
      ["1", "2", "3", "4", "5"],
    );
  });

  test("an external contract, a generated file, and null inside a string or a comment pass", () => {
    const quiet = [
      wrote("null-guard", "row.ts", "deletedAt: Date | null // external contract: the column is nullable\n", {
        tool: "Edit",
      }),
      wrote("null-guard", "drizzle/schema.ts", "deletedAt: Date | null\n"),
      wrote("null-guard", "api.d.ts", "export type A = string | null\n"),
      wrote("null-guard", "masked.ts", 'const doc = "x | null"\n// was: x === null\n', { tool: "Edit" }),
      wrote("null-guard", "script.py", "x: str | None = None\nif x is None: pass\n"),
    ];
    assert.deepEqual(quiet, ["", "", "", "", ""]);
  });
});

describe("namespace-guard", () => {
  test("flags siblings sharing a prefix and an export *, reading the whole file rather than the edit", () => {
    const said = wrote("namespace-guard", "google.ts", "export const googleSignout = () => 2\n", {
      tool: "Edit",
      file: "export const googleLogin = () => 1\nexport const googleSignout = () => 2\nexport * from './oauth'\n",
    });
    assert.ok(said.includes("googleLogin") && said.includes("googleSignout") && said.includes("export *"), said);
  });

  test("stays quiet on composables, verb prefixes and a lone namespace", () => {
    const text =
      "export const useThing = () => 1\nexport const useOther = () => 2\nexport const formatDate = () => 3\nexport const formatMoney = () => 4\nexport const Google = { login: 1 }\n";
    assert.equal(wrote("namespace-guard", "things.ts", text), "");
  });
});

describe("token-guard", () => {
  test("flags a raw colour, duration, curve, arbitrary Tailwind value and size in what a style edit adds", () => {
    const said = wrote(
      "token-guard",
      "card.vue",
      [
        "  color: #7c3aed;",
        "  transition: opacity 200ms ease;",
        "  transition-timing-function: cubic-bezier(.2, 0, 0, 1);",
        '  <div class="w-[340px] bg-[#fff]">',
        "  font-size: 13px;",
        "  animate(el, { duration: 300 })",
      ].join("\n"),
      { tool: "Edit" },
    );
    assert.deepEqual(
      [...said.matchAll(/line (\d+) /g)].map((match) => match[1]),
      ["1", "2", "3", "4", "5", "6"],
    );
  });

  test("token definitions, motion resets, hairlines, allowed brackets, marked lines and scripts pass", () => {
    const quiet = [
      wrote("token-guard", "palette.css", ":root {\n  --primary: #7c3aed;\n  --ease-out: cubic-bezier(.23, 1, .32, 1);\n}\n"),
      wrote("token-guard", "reduce.css", "  transition-duration: 0ms;\n  animation-duration: 0.01ms;\n", { tool: "Edit" }),
      wrote(
        "token-guard",
        "layout.vue",
        '  border: 1px solid var(--border);\n  <div class="grid-cols-[1fr_2fr] w-[calc(100%-var(--rail))] max-h-[60vh]">\n  transition-duration: var(--duration-fast);\n  animation: creep 12s cubic-bezier(0.1, 0.65, 0.2, 1) forwards;\n  <code class="text-[0.9em]">\n',
        { tool: "Edit" },
      ),
      wrote("token-guard", "brand.css", "  color: #1da1f2; /* no token: the vendor's brand colour */\n", { tool: "Edit" }),
      wrote("token-guard", "theme.ts", 'export const ink = "#17151e"\n'),
      wrote("token-guard", "fallback.css", "  font-size: var(--fs-base, 16px);\n  color: var(--ink, #17151e);\n", {
        tool: "Edit",
      }),
      wrote("token-guard", "skills/create-artifact/assets/pack.css", "  padding: 72px 24px;\n", { tool: "Edit" }),
      wrote("token-guard", "design/css/prose.css", "  font-size: 15px;\n  border-radius: 6px;\n", { tool: "Edit" }),
    ];
    assert.deepEqual(quiet, ["", "", "", "", "", "", "", ""]);
  });
});

describe("memory-guard, on a durable rule file", () => {
  const rules = (name: string) => join(".claude", "rules", name);

  test("counts the tells of a log entry: dates, hashes, verification claims, exit codes, scratch paths", () => {
    const said = wrote(
      "memory-guard",
      "CLAUDE.md",
      "- Fixed on 2026-10-09 in `abc1234f` (verified), the job exits 0 from /private/tmp/x as of today\n",
      { tool: "Edit" },
    );
    for (const tell of [
      "dated entry",
      "commit hash",
      "verification claim",
      "exit code",
      "scratch path",
      "point-in-time phrasing",
    ])
      assert.match(said, new RegExp(tell));
  });

  test("refuses a list dumped in one edit and a near copy of a rule already there", () => {
    const bullets = "- one rule here\n- two rule here\n- three rule here\n- four rule here\n";
    assert.match(wrote("memory-guard", rules("dump.md"), bullets, { tool: "Edit" }), /4 new bullets/);
    const existing = "- Never commit the local settings file, it stays gitignored on every machine.\n";
    const reworded = "- The local settings file is never committed, it stays gitignored on every machine.\n";
    assert.match(
      wrote("memory-guard", rules("dup.md"), reworded, { tool: "Edit", file: existing + reworded }),
      /% overlap with a rule already in the file/,
    );
  });

  test("a whole-file write is not judged by size, and a file that is not a rule file is not judged at all", () => {
    const many = "- one rule here\n- two rule here\n- three rule here\n- four rule here\n";
    assert.equal(wrote("memory-guard", rules("fresh.md"), many), "");
    assert.equal(wrote("memory-guard", "notes.md", "- 2026-10-09 shipped `abc1234f`\n", { tool: "Edit" }), "");
  });
});

test("the write guards answer as PostToolUse context, so the note stays visible in the transcript", () => {
  const path = write(join(tmp, "shape.ts"), "function load(): string | null {}\n");
  const done = fire(
    "guards/null-guard",
    {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: path, content: "function load(): string | null {}\n" },
    },
    vars,
  );
  assert.ok(!silent(done));
  assert.deepEqual(Object.keys(JSON.parse(done.stdout) as object), ["hookSpecificOutput"]);
});
