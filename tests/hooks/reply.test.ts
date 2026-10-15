import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { Reply, Turns } from "../../lib/hook/transcript.ts";
import { setSlot } from "../../lib/mode/slots.ts";
import { env, fire, output, PLUGIN, said, scratch, silent, transcript, used, user, type Line } from "../support.ts";

const tmp = scratch("mode-reply-");
const config = join(tmp, "config");
process.env.CLAUDE_CONFIG_DIR = config;
process.env.MODE_PLUGIN_ROOT = PLUGIN;
const vars = env({ CLAUDE_PLUGIN_ROOT: PLUGIN });

let count = 0;
const sid = (): string => `r${String(++count).padStart(7, "0")}`;

const stop = (hook: string, session: string, lines: Line[], active = false) =>
  fire(
    `guards/${hook}`,
    { session_id: session, hook_event_name: "Stop", transcript_path: transcript(tmp, lines), stop_hook_active: active },
    vars,
  );
const zapped = (done: ReturnType<typeof fire>): string => output(done).hookSpecificOutput?.additionalContext ?? "";
// What Claude Code writes into the transcript once a Stop hook has spoken this turn.
const spoke = (marker: string): Line => ({
  type: "attachment",
  attachment: { type: "hook_system_message", content: `⚡ ${marker}: rewriting.` },
});

describe("turns, as the Stop guards read them", () => {
  test("only a message a person typed opens a turn: tool results, interjections and injected wrappers ride inside it", () => {
    const lines: Line[] = [
      user("fix the parser"),
      used("Read", { file_path: "/a.ts" }, "r1"),
      {
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "r1", content: "contents" },
            { type: "text", text: "also check b.ts" },
          ],
        },
      },
      user("<system-reminder>\nnote\n</system-reminder>"),
      used("Edit", { file_path: "/a.ts" }),
      said("Done."),
    ];
    assert.deepEqual(
      Turns.calls(lines).map((turn) => turn.map(([name]) => name)),
      [["Read", "Edit"]],
    );
    assert.equal(Turns.tail(lines), "Done.");
  });

  test("an X/Y/Z read has to open the reply, in order, with real content", () => {
    const read = "X — fix the parser\nY — the tests go green\nZ — the fixture moves too";
    assert.deepEqual(
      [
        read,
        `Sure.\n${read}`,
        "Y — b\nX — a\nZ — c",
        "X — what I typed\nY — what I actually expect\nZ — what that forces into existence",
        "X — only one",
      ].map(Reply.xyzGap),
      [
        undefined,
        "not at the start — the read opens the reply, before anything else",
        "out of order — it must read X, then Y, then Z",
        "the template pasted verbatim — each line carries the actual content, not the label's definition",
        "missing Y, Z",
      ],
    );
  });
});

describe("prose-check", () => {
  test("quotes the lines carrying an em dash, a spaced en dash or a symbol standing in for a word", () => {
    const context = zapped(
      stop("prose-check", sid(), [user("go"), said("It works — mostly.\nThe cache is fine.\nA → B means done.")]),
    );
    assert.ok(
      context.includes("| It works — mostly.") &&
        context.includes("| A → B means done.") &&
        !context.includes("cache is fine"),
      context,
    );
  });

  test("leaves code, quotes and the X/Y/Z label dash alone", () => {
    const reply = "X — the read\n```\na — b\n```\nUse `a → b` here.\n> quoted — text";
    assert.ok(silent(stop("prose-check", sid(), [user("go"), said(reply)])));
  });

  test("says it once per turn, and never on its own repair turn", () => {
    const slop = [user("go"), said("It works — mostly.")];
    assert.ok(silent(stop("prose-check", sid(), [...slop, spoke("prose-check")])));
    assert.ok(silent(stop("prose-check", sid(), slop, true)));
  });
});

describe("xyz-check, while the xyz style is held", () => {
  const held = (style = "xyz"): string => {
    const session = sid();
    setSlot({ axis: "style", session, name: style });
    return session;
  };
  const READ = "X — fix the parser\nY — the tests go green\nZ — the fixture moves too";
  const work: Line[] = [used("Write", { file_path: "/repo/a.ts" }), used("Write", { file_path: "/repo/b.ts" })];

  test("asks for the read when the reply opens without it", () => {
    assert.match(
      zapped(stop("xyz-check", held(), [user("go"), said("Done, the parser is fixed.")])),
      /did not open with a valid X\/Y\/Z read \(missing X, Y, Z\)/,
    );
  });

  test("with the read in place, a work turn still has to close on a summary after its last tool call", () => {
    assert.match(zapped(stop("xyz-check", held(), [user("go"), said(READ), ...work])), /does not close with a summary/);
    assert.ok(
      silent(stop("xyz-check", held(), [user("go"), said(READ), ...work, said("Fixed the parser, both files.")])),
    );
  });

  test("says nothing under another style, or on its own repair turn", () => {
    const missing = [user("go"), said("Done.")];
    assert.ok(silent(stop("xyz-check", held("edu"), missing)));
    assert.ok(silent(stop("xyz-check", held(), missing, true)));
  });
});
