import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { deliverableCommand } from "../../lib/mode/deliverable.ts";
import { approve, done, setSlot } from "../../lib/mode/slots.ts";
import {
  contract,
  crashed,
  denial,
  env,
  fire,
  fixtureRoot,
  output,
  PLUGIN,
  scratch,
  silent,
  write,
  type Env,
} from "../support.ts";

const tmp = scratch("mode-gates-");
const config = join(tmp, "config");
process.env.CLAUDE_CONFIG_DIR = config;
process.env.MODE_PLUGIN_ROOT = PLUGIN;
const vars = env({ CLAUDE_PLUGIN_ROOT: PLUGIN });

let count = 0;
const sid = (): string => `g${String(++count).padStart(7, "0")}`;
const hold = (session: string, name: string): void => void setSlot({ axis: "mode", session, name });

// A fixture tree whose mode names appear nowhere in the shipped set, so a guard keyed on a name instead of the flag fails here.
const flagged = fixtureRoot(join(tmp, "flagged"), {
  modes: {
    warden: contract({ name: "warden", keys: "no-dispatch-without-approval: true\n" }),
    redfirst: contract({ name: "redfirst", keys: "no-code-without-red: true\n" }),
    loose: contract({ name: "loose" }),
  },
});
const atFlagged = env({ CLAUDE_PLUGIN_ROOT: PLUGIN, MODE_PLUGIN_ROOT: flagged });
function holdFlagged(session: string, name: string): void {
  process.env.MODE_PLUGIN_ROOT = flagged;
  try {
    hold(session, name);
  } finally {
    process.env.MODE_PLUGIN_ROOT = PLUGIN;
  }
}

function configured(json: object, action: () => void): void {
  const path = write(join(config, "mode", "config.json"), JSON.stringify(json));
  try {
    action();
  } finally {
    rmSync(path);
  }
}

describe("every hook, fed something that is not a payload", () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")) as {
    hooks: Record<string, { hooks: { command: string }[] }[]>;
  };
  const stems = [
    ...new Set(
      Object.values(manifest.hooks).flatMap((groups) =>
        groups.flatMap(({ hooks }) => hooks.map(({ command }) => /\/hooks\/run" (\S+)$/.exec(command)?.[1] ?? "")),
      ),
    ),
  ];

  test("exits 0 and says nothing, so it never breaks the turn", () => {
    const loud = stems.flatMap((stem) =>
      // An empty subject has no category, so board-category refusing {} is its rule rather than noise.
      (stem === "guards/board-category" ? ["not json"] : ["not json", "{}"]).flatMap((input) => {
        const done = fire(stem, input, vars);
        return done.status === 0 && !done.stdout.trim() && !done.stderr.trim() && !crashed(done)
          ? []
          : [`${stem} on ${input}: ${done.status} ${done.stdout}${done.stderr}`];
      }),
    );
    assert.ok(stems.length > 20);
    assert.deepEqual(loud, []);
  });
});

describe("gate, on a dispatch", () => {
  const agent = (session: string, tool = "Agent", at: Env = vars) =>
    fire(
      "gate",
      {
        session_id: session,
        hook_event_name: "PreToolUse",
        tool_name: tool,
        cwd: PLUGIN,
        tool_input: { description: "build a thing", prompt: "go", subagent_type: "general-purpose" },
      },
      at,
    );

  test("a mode declaring no-dispatch-without-approval denies until its own approval lands, saying how to clear it", () => {
    const session = sid();
    hold(session, "copilot");
    const shut = agent(session);
    assert.equal(shut.stdout.trim().split("\n").length, 1);
    assert.equal(output(shut).hookSpecificOutput?.hookEventName, "PreToolUse");
    assert.ok(/copilot/.test(denial(shut) ?? "") && /approve/i.test(denial(shut) ?? ""), shut.stdout);
    approve({ slug: "some-spec", session });
    assert.ok(silent(agent(session)));
  });

  test("the flag decides, whatever the mode is called, and a yes given under another mode does not carry over", () => {
    const session = sid();
    holdFlagged(session, "loose");
    approve({ slug: "elsewhere", session });
    holdFlagged(session, "warden");
    assert.ok(denial(agent(session, "Agent", atFlagged)));
    approve({ slug: "here", session });
    assert.ok(silent(agent(session, "Agent", atFlagged)));
  });

  test("nothing held, a mode without the flag, or a tool other than Agent passes", () => {
    const [none, free, other] = [sid(), sid(), sid()];
    hold(free, "debug");
    hold(other, "copilot");
    assert.ok([agent(none), agent(free), agent(other, "Bash")].every(silent));
  });

  test("a gate that cannot read the contracts lets the dispatch through rather than inventing a refusal", () => {
    const session = sid();
    hold(session, "copilot");
    assert.ok(
      silent(agent(session, "Agent", env({ CLAUDE_PLUGIN_ROOT: PLUGIN, MODE_PLUGIN_ROOT: join(tmp, "missing") }))),
    );
  });
});

describe("red-guard, on a write", () => {
  const edit = (session: string, path: string, { tool = "Edit", at = vars }: { tool?: string; at?: Env } = {}) =>
    fire(
      "guards/red-guard",
      {
        session_id: session,
        hook_event_name: "PreToolUse",
        tool_name: tool,
        cwd: PLUGIN,
        tool_input: { file_path: path },
      },
      at,
    );

  test("a mode declaring no-code-without-red refuses an implementation edit until a watched failure stands", () => {
    const session = sid();
    hold(session, "tdd");
    const why = denial(edit(session, "/repo/src/parser.ts")) ?? "";
    assert.ok(why.includes("tdd") && why.includes("parser.ts") && /fail/i.test(why), why);
    done({ axis: "mode", session, reason: "test-fail" });
    assert.ok(silent(edit(session, "/repo/src/parser.ts")));
    done({ axis: "mode", session, reason: "test" });
    assert.ok(denial(edit(session, "/repo/src/parser.ts")));
  });

  test("the test and everything around it stays writable", () => {
    const session = sid();
    hold(session, "tdd");
    const paths = [
      "/repo/tests/parser.ts",
      "/repo/src/parser.test.ts",
      "/repo/src/test_parser.py",
      "/repo/src/parser.spec.js",
      "/repo/conftest.py",
      "/repo/README.md",
      "/repo/package.json",
      "/repo/fixtures/thing.ts",
    ];
    assert.deepEqual(
      paths.filter((path) => denial(edit(session, path))),
      [],
    );
  });

  test("the flag decides whatever the mode is called, and nothing else is judged", () => {
    const [named, free, red] = [sid(), sid(), sid()];
    holdFlagged(named, "redfirst");
    hold(free, "debug");
    hold(red, "tdd");
    assert.ok(denial(edit(named, "/repo/src/parser.ts", { at: atFlagged })));
    assert.ok(silent(edit(free, "/repo/src/parser.ts")));
    assert.ok(silent(edit(red, "/repo/src/parser.ts", { tool: "Bash" })));
  });

  test("guards off in config.json disarms it", () => {
    const session = sid();
    hold(session, "tdd");
    configured({ guards: "off" }, () => assert.ok(silent(edit(session, "/repo/src/parser.ts"))));
  });
});

describe("shell-write-guard, and the switch that disarms the guards", () => {
  const bash = (command: string) =>
    fire(
      "guards/shell-write-guard",
      { session_id: "h-guard", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } },
      vars,
    );
  const cat = () => bash("cat notes.txt");

  test("denies reading, editing in place and authoring a file through the shell, wrappers and heredocs included", () => {
    const commands = [
      "cat notes.txt",
      "head -n 5 src/a.ts",
      "sudo cat /etc/hosts",
      "FOO=1 tail ./log.txt",
      "sed -n '1,5p' a.ts",
      "sed -i 's/a/b/' a.ts",
      "perl -pi -e 's/a/b/' a.ts",
      "echo hi > out.txt",
      "printf 'x' >> log.md",
      "echo hi | tee out.txt",
      "cat <<EOF > notes.md\nhello > world\nEOF",
      "node - <<EOF > out.txt\nconsole.log(1)\nEOF",
    ];
    assert.deepEqual(
      commands.filter((command) => !denial(bash(command))),
      [],
    );
  });

  test("lets pipelines, a followed log, a byte slice, /dev/null and everything that is not a file read through", () => {
    const commands = [
      "cat notes.txt | jq .",
      "tail -f server.log",
      "head -c 64 file.bin",
      "echo hi > /dev/null",
      "cat $(mktemp)",
      "echo 'a > b'",
      "git status",
      "grep foo src/a.ts",
      "cat <<EOF | node -\necho one > two.txt\nEOF",
    ];
    assert.deepEqual(
      commands.filter((command) => !silent(bash(command))),
      [],
    );
  });

  test("guards off silences every guard, disarm silences the named one alone", () => {
    configured({ guards: "off" }, () => assert.ok(silent(cat())));
    configured({ disarm: ["shell-write-guard"] }, () => assert.ok(silent(cat())));
    configured({ disarm: ["board-check"] }, () => assert.ok(denial(cat())));
  });
});

describe("router-guard, while swarm or dispatcher is held", () => {
  const wrote = (session: string, extra: object = {}) =>
    fire(
      "guards/router-guard",
      {
        session_id: session,
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/repo/src/thing.ts" },
        ...extra,
      },
      vars,
    );

  test("the router's own write is denied, while a subagent carrying agent_id writes", () => {
    const session = sid();
    hold(session, "swarm");
    assert.ok(denial(wrote(session)));
    assert.ok(silent(wrote(session, { agent_id: "sub-123" })));
  });

  test("the dispatcher's own write and edit are denied, its subagents are not, and leaving dispatcher lifts the fence", () => {
    const session = sid();
    hold(session, "dispatcher");
    assert.match(denial(wrote(session)) ?? "", /dispatches/);
    assert.ok(denial(wrote(session, { tool_name: "Edit" })));
    assert.ok(silent(wrote(session, { agent_id: "sub-123" })));
    hold(session, "ic");
    assert.ok(silent(wrote(session)));
  });
});

describe("director-guard, which keeps the director's hands off the work", () => {
  const lead = join(tmp, "lead.jsonl");
  const director = "a4c36797db827b609";
  // The live shape: a bare id, with the name only in the meta file beside the lead's transcript.
  for (const [agent, name] of [
    [director, "director"],
    ["a9b14b6d84d00b2ba", "tool-probe"],
  ]) {
    write(
      join(tmp, "lead", "subagents", `agent-${agent}.meta.json`),
      JSON.stringify({ agentType: "general-purpose", name }),
    );
  }
  const acted = (tool: string, input: object, agent?: string) =>
    fire(
      "guards/director-guard",
      {
        session_id: "h-director",
        hook_event_name: "PreToolUse",
        tool_name: tool,
        cwd: "/repo",
        transcript_path: lead,
        tool_input: input,
        ...(agent ? { agent_id: agent } : {}),
      },
      vars,
    );

  test("the director's write and board item are denied, its name read from the meta file or from its own id", () => {
    assert.match(denial(acted("Write", { file_path: "/repo/src/thing.ts" }, director)) ?? "", /never writes/);
    assert.match(
      denial(acted("TaskCreate", { subject: "[AI] check the retry path" }, director)) ?? "",
      /lead boards it/,
    );
    assert.ok(denial(acted("Agent", { prompt: "go" }, "adirector-2-8923b06016cfaadf")));
  });

  test("a git write or a branch deletion is denied, while read-only git and probes pass", () => {
    assert.match(
      denial(acted("Bash", { command: "git status && git -C /repo commit -m wip" }, director)) ?? "",
      /commit/,
    );
    assert.ok(denial(acted("Bash", { command: "git branch -D old-work" }, director)));
    assert.ok(
      silent(acted("Bash", { command: "git diff --stat && git log -3 && git stash list && git branch -a" }, director)),
    );
  });

  test("another named agent and the lead itself are untouched", () => {
    assert.ok(silent(acted("Write", { file_path: "/repo/src/thing.ts" }, "a9b14b6d84d00b2ba")));
    assert.ok(silent(acted("TaskCreate", { subject: "[AI] build it" })));
  });
});

describe("deliverable-guard, which holds every delivery act to the named north star", () => {
  const session = "h-north0";
  const act = (tool: string, input: object, extra: object = {}) =>
    fire(
      "guards/deliverable-guard",
      {
        session_id: session,
        hook_event_name: "PreToolUse",
        tool_name: tool,
        cwd: "/work/repo",
        tool_input: input,
        ...extra,
      },
      vars,
    );
  const name = (...words: string[]) => deliverableCommand({ words, session });

  test("the first edit waits for a deliverable, while a scratch file never counts as one", () => {
    hold(session, "pair");
    assert.match(denial(act("Write", { file_path: "/work/repo/src/thing.ts" })) ?? "", /No deliverable is named/);
    assert.ok(silent(act("Write", { file_path: join(tmpdir(), "probe.py") })));
  });

  test("an edit is a change, so it waits for change to be named, and then goes", async () => {
    await name("answer");
    assert.match(denial(act("Edit", { file_path: "/work/repo/src/thing.ts" })) ?? "", /is a change/);
    await name("change", "the retry fix");
    assert.ok(silent(act("Edit", { file_path: "/work/repo/src/thing.ts" })));
  });

  test("a page in an artifacts folder is an artifact, while code under a folder of that name is a change", () => {
    assert.match(denial(act("Write", { file_path: "/work/notes/artifacts/plan.html" })) ?? "", /is an artifact/);
    assert.ok(silent(act("Edit", { file_path: "/work/repo/server/api/artifacts/[slug]/review.post.ts" })));
  });

  test("a push past how the tree ships and a message nobody asked to send are refused, naming the fix", () => {
    assert.match(denial(act("Bash", { command: "git -C /work/repo push" })) ?? "", /--ship push/);
    assert.match(denial(act("mcp__claude_ai_Gmail__send_message", { to: "someone" })) ?? "", /add post/);
  });

  test("a teammate works to its own charter, and a mode that delivers nothing has no north star", () => {
    assert.ok(silent(act("Bash", { command: "git -C /work/repo push" }, { agent_id: "a4c36797db827b609" })));
    hold(session, "dispatcher");
    assert.ok(silent(act("Bash", { command: "git -C /work/repo push" })));
  });
});

describe("roster-guard, which makes swarm's file test a check", () => {
  const session = "h-roster";
  const board = join(config, "tasks", `session-${session.slice(0, 8)}`);
  type Item = { subject: string; metadata: { owner: string; files: string[]; notes?: string } };
  const roster = (...items: Item[]): void => {
    rmSync(board, { recursive: true, force: true });
    mkdirSync(board, { recursive: true });
    items.forEach((item, i) =>
      write(join(board, `${i + 1}.json`), JSON.stringify({ id: String(i + 1), status: "in_progress", ...item })),
    );
  };
  const spawn = (owner: string, prompt: string) =>
    fire(
      "guards/roster-guard",
      { session_id: session, hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { name: owner, prompt } },
      vars,
    );
  const api: Item = {
    subject: "#1 Api",
    metadata: { owner: "Api", files: ["server/api/orders.ts"], notes: "the retry path posts to the ledger twice" },
  };
  const good =
    "You own server/api/orders.ts under ~/repo, and nothing under app/. the retry path posts to the ledger twice. Close with ## Domain notes.";

  test("a complete charter for an owner on the board goes through", () => {
    hold(session, "swarm");
    roster(api);
    assert.ok(silent(spawn("Api", good)));
  });

  test("an owner the board never heard of, or two owners over one path, is denied", () => {
    roster({ subject: "#1 Web", metadata: { owner: "Web", files: ["app/x.vue"] } });
    assert.ok(denial(spawn("Api", good)));
    roster(api, { subject: "#2 Web", metadata: { owner: "Web", files: ["server/api/orders.ts"] } });
    assert.ok(denial(spawn("Api", good)));
  });

  test("a charter missing its files, the roster's notes or the handback is denied", () => {
    roster(api);
    const missing = [
      "Go and fix the orders bug. ## Domain notes please.",
      "You own server/api/orders.ts. Close with ## Domain notes.",
      "You own server/api/orders.ts. the retry path posts to the ledger twice.",
    ];
    assert.deepEqual(
      missing.filter((prompt) => !denial(spawn("Api", prompt))),
      [],
    );
  });

  test("under any other mode it says nothing", () => {
    hold(session, "ic");
    roster(api);
    assert.ok(silent(spawn("nobody", "anything")));
  });
});
