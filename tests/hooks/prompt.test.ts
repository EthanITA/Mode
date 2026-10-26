import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pipelineFor } from "../../lib/mode/pipeline.ts";
import { approve, done, getSlot, red, setSlot } from "../../lib/mode/slots.ts";
import { declared } from "../../lib/mode/state.ts";
import { contextOf, env, fire, fixtureRoot, output, PLUGIN, scratch, write, contract, type Run } from "../support.ts";

const tmp = scratch("mode-prompt-");
const config = join(tmp, "config");
process.env.CLAUDE_CONFIG_DIR = config;
process.env.MODE_PLUGIN_ROOT = PLUGIN;
const vars = env({ CLAUDE_PLUGIN_ROOT: PLUGIN });

let count = 0;
const sid = (): string => `p${String(++count).padStart(7, "0")}`;

type Axis = "mode" | "style";
const get = (axis: Axis, session: string): string => getSlot({ axis, session });
const slots = (session: string): [string, string] => [get("mode", session), get("style", session)];

const prompt = (session: string, text?: string, cwd = PLUGIN): Run =>
  fire(
    "inject",
    {
      session_id: session,
      hook_event_name: "UserPromptSubmit",
      transcript_path: "/nonexistent.jsonl",
      cwd,
      prompt: text,
    },
    vars,
  );
const start = (session: string, source: string, cwd = PLUGIN): Run =>
  fire("resume", { session_id: session, hook_event_name: "SessionStart", source, cwd }, vars);
const PARTS = ["start/rules-1", "start/rules-2", "start/mode", "start/style"];
// Every SessionStart command, each one's context kept apart, because each gets its own hook budget.
const opening = (session: string, source: string, cwd = PLUGIN): string[] => {
  start(session, source, cwd);
  return PARTS.map((part) =>
    contextOf(fire(part, { session_id: session, hook_event_name: "SessionStart", source, cwd }, vars)),
  );
};

// A prompt the hook answers itself: its reason is the whole reply, and the prompt never reaches the model.
const ended = (done: Run): { reason: string; suppressed: boolean } => {
  const body = output(done);
  return body.decision === "block"
    ? { reason: body.reason ?? "", suppressed: !!body.hookSpecificOutput?.suppressOriginalPrompt }
    : { reason: "", suppressed: false };
};

const tagged = (name: string, args = ""): string =>
  `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>${args ? `\n<command-args>${args}</command-args>` : ""}`;

describe("hooks.json", () => {
  const raw = readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8");
  const manifest = JSON.parse(raw) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
  const commands = Object.values(manifest.hooks).flatMap((groups) =>
    groups.flatMap(({ hooks }) => hooks.map(({ command }) => command)),
  );

  test("every command runs a shipped hook through ${CLAUDE_PLUGIN_ROOT} on node, with no home path", () => {
    const wrong = commands.filter((command) => {
      const stem = /\/hooks\/run" (\S+)$/.exec(command)?.[1];
      return (
        !command.includes("${CLAUDE_PLUGIN_ROOT}") ||
        /\/Users\/|\/home\/[a-z]|\$HOME|~\/|python/.test(command) ||
        !stem ||
        !existsSync(join(PLUGIN, "hooks", `${stem}.ts`))
      );
    });
    assert.ok(commands.length);
    assert.deepEqual(wrong, []);
  });

  test("every event is one Claude Code fires", () => {
    const EVENTS = [
      "UserPromptSubmit",
      "SessionStart",
      "PostToolUse",
      "PostToolUseFailure",
      "PreToolUse",
      "SessionEnd",
      "Stop",
      "SubagentStop",
      "PreCompact",
      "Notification",
      "TaskCreated",
    ];
    assert.deepEqual(
      Object.keys(manifest.hooks).filter((event) => !EVENTS.includes(event)),
      [],
    );
  });
});

describe("inject, on every prompt", () => {
  test("with no start hook the first prompt carries the ground rules, later ones only the prose reminder", () => {
    const session = sid();
    assert.match(contextOf(prompt(session, "carry on")), /Ground rules/);
    const later = contextOf(prompt(session, "carry on"));
    assert.ok(!later.includes("Ground rules") && later.includes("Ground rule prose, which outranks"), later);
  });

  test("a start sends the ground rules and the held contracts in parts under the cap, and the first prompt repeats none", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "ic" });
    setSlot({ axis: "style", session, name: "native" });
    const parts = opening(session, "startup");
    assert.match(parts[0] ?? "", /^# Ground rules/);
    assert.ok((parts[2] ?? "").includes("Active mode: ic") && (parts[3] ?? "").includes("Active style: native"));
    assert.deepEqual(
      parts.filter((part) => part.length > 10_000),
      [],
    );
    const first = contextOf(prompt(session, "go"));
    assert.ok(!first.includes("Ground rules") && !first.includes("Standing reminder"), first);
    const resumed = opening(session, "compact").join("\n");
    assert.ok(resumed.includes("Ground rules") && resumed.includes("Active mode: ic"), resumed);
  });

  test("a held mode comes back as one line of UserPromptSubmit context, its placeholders filled", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "copilot" });
    const done = prompt(session, "carry on");
    assert.equal(done.stdout.trim().split("\n").length, 1);
    assert.equal(output(done).hookSpecificOutput?.hookEventName, "UserPromptSubmit");
    assert.ok(contextOf(done) && !contextOf(done).includes("{{"));
  });

  test("a held contract goes out once, a switch names the one it replaced, and off is said out loud", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "copilot" });
    assert.match(contextOf(prompt(session, "one")), /Active mode: copilot[\s\S]*Standing reminder/);
    const held = contextOf(prompt(session, "two"));
    assert.ok(!held.includes("Standing reminder") && held.includes("Ground rule prose, which outranks"), held);
    setSlot({ axis: "mode", session, name: "tdd" });
    const swapped = contextOf(prompt(session, "three"));
    assert.ok(
      swapped.includes("The mode switched from copilot to tdd") && swapped.includes("Standing reminder"),
      swapped,
    );
    setSlot({ axis: "mode", session, name: "off" });
    assert.ok(contextOf(prompt(session, "four")).includes("The mode tdd is off now"));
    assert.ok(!contextOf(prompt(session, "five")).includes("off now"));
  });

  test("a mode and a style switched on one prompt that would outgrow a hook send the style on the next prompt, said so", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "ic" });
    setSlot({ axis: "style", session, name: "native" });
    opening(session, "startup");
    const both = prompt(session, "/mode:copilot /style:edu plan the dashboard");
    const now = contextOf(both);
    assert.ok(now.length <= 10_000 && !now.includes("Read that file"), `${now.length}`);
    assert.ok(
      now.includes("switched from ic to copilot") && now.includes("its contract arrives with the next prompt"),
      now,
    );
    const next = contextOf(prompt(session, "go on"));
    assert.ok(next.includes("The style switched from native to edu") && next.includes("Standing reminder"), next);
  });

  test("a rule the user loads as memory is never injected again, and its reminder still comes every turn", () => {
    const session = sid();
    const settings = write(join(config, "mode", "config.json"), JSON.stringify({ memory: ["prose"] }));
    try {
      const first = contextOf(prompt(session, "carry on"));
      assert.ok(
        /Ground rules/.test(first) &&
          !first.includes("## Prose") &&
          first.includes("Ground rule prose, which outranks"),
        first,
      );
    } finally {
      write(settings, "{}");
    }
  });

  test("the turn a mode is entered on carries more than the turn after it, and a resume earns the whole contract again", () => {
    const session = sid();
    prompt(session, "one");
    setSlot({ axis: "mode", session, name: "copilot" });
    const [entered, settled] = [contextOf(prompt(session, "two")), contextOf(prompt(session, "three"))];
    assert.ok(entered.length > settled.length && settled.length > 0);
    assert.ok(opening(session, "resume").join("\n").includes("Active mode: copilot"));
    assert.equal(get("mode", session), "copilot");
  });
});

describe("a switch typed in the prompt", () => {
  test("reaches the slot each name belongs to, in every spelling the palette and a person send", () => {
    const table: [typed: string, mode: string, style: string][] = [
      ["/mode tdd native", "tdd", "native"],
      ["/mode native tdd", "tdd", "native"],
      ["/mode native", "", "native"],
      ["/mode tdd", "tdd", ""],
      ["/mode nonsense", "", ""],
      ["/mode tdd debug", "tdd", ""],
      ["/style native edu", "", "native"],
      ["/mode tdd tdd native", "tdd", "native"],
      ["/mode:tdd", "tdd", ""],
      ["/mode:style:ship", "", "ship"],
      ["/mode:edu", "", "edu"],
      ["/style:ship", "", "ship"],
      ["/mode:auto", "auto", ""],
      ["/commit a message", "", ""],
      ["/tdd", "", ""],
      [tagged("mode:tester"), "tester", ""],
      [tagged("style:edu"), "", "edu"],
      [tagged("mode:tdd", "go ahead now"), "tdd", ""],
      [tagged("mode:style:ship"), "", "ship"],
      [tagged("commit", "a message"), "", ""],
      ["/mode:debug /style:edu", "debug", "edu"],
      ["/style:ship /mode:ic", "ic", "ship"],
      ["/mode:ic fix this /style:ship now", "ic", "ship"],
      ["/mode:tdd /commit a message /style:fast", "tdd", "fast"],
      ["/mode ic fix", "ic", ""],
    ];
    const got = table.map(([typed]) => {
      const session = sid();
      prompt(session, typed);
      return [typed, ...slots(session)];
    });
    assert.deepEqual(got, table);
  });

  test("moves only the slot it names, and off empties just that one", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "copilot" });
    setSlot({ axis: "style", session, name: "edu" });
    prompt(session, "/mode debug");
    assert.deepEqual(slots(session), ["debug", "edu"]);
    prompt(session, "/style native");
    assert.deepEqual(slots(session), ["debug", "native"]);
    prompt(session, "/mode off");
    assert.deepEqual(slots(session), ["", "native"]);
  });

  test("the namespaced approve records the slug rather than reading it as a contract", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "copilot" });
    prompt(session, "/mode:approve a-real-spec");
    assert.equal(approve({ session }), "a-real-spec");
  });

  test("a message that is only the switch ends in the hook, while one carrying an ask goes on to the model", () => {
    const table: [typed: string, ends: boolean][] = [
      ["/mode debug", true],
      ["/mode:debug /style:edu", true],
      ["/mode off", true],
      ["/mode", true],
      [tagged("mode:tester"), true],
      ["/mode debug fix the parser", false],
      ["/mode:tdd /commit a message", false],
      ["carry on", false],
      [tagged("mode:tdd", "go ahead now"), false],
      [tagged("commit", "a message"), false],
    ];
    const got = table.map(([typed]) => {
      const { reason, suppressed } = ended(prompt(sid(), typed));
      return [typed, !!reason && suppressed];
    });
    assert.deepEqual(got, table);
  });

  test("the answer names what the slot now holds with the status line's chip, and a bare axis lists instead of switching", () => {
    assert.ok(
      ended(prompt(sid(), "/mode debug")).reason.includes("debug") &&
        ended(prompt(sid(), "/mode debug")).reason.includes("\u{1F9ED}"),
    );
    const session = sid();
    const listed = ended(prompt(session, "/mode")).reason;
    assert.ok(listed.includes("autopilot") && listed.includes("tester") && !get("mode", session), listed);
  });

  test("the whole contract still reaches the first real prompt after a switch the hook answered", () => {
    const session = sid();
    prompt(session, "/mode tdd");
    const [first, second] = [contextOf(prompt(session, "now start")), contextOf(prompt(session, "keep going"))];
    assert.ok(first.includes("Active mode: tdd") && first.length > second.length * 2);
  });
});

describe("/why, answered in the hook", () => {
  test("every spelling ends the turn with the report", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "tdd" });
    for (const typed of ["/why", "/mode:why", "/mode why", "/style why"]) {
      const { reason, suppressed } = ended(prompt(session, typed));
      assert.ok(reason.includes("What is steering") && reason.includes("tdd") && suppressed, typed);
    }
  });

  test("asked beside a real ask it rides the turn, and never switches a slot", () => {
    const session = sid();
    const done = prompt(session, "/why then fix the parser");
    assert.ok(!ended(done).reason && contextOf(done).includes("What is steering"));
    assert.equal(get("mode", session), "");
  });
});

describe("a pin reaching a conversation through the hooks", () => {
  const pinned = join(tmp, "pinned-repo", "src");
  write(join(tmp, "pinned-repo", ".mode"), "mode: tester\nstyle: native\n");
  write(join(pinned, ".keep"), "");

  test("a session starting in a pinned tree adopts both slots, and so does a first prompt whose start hook never ran", () => {
    const [started, prompted] = [sid(), sid()];
    start(started, "startup", pinned);
    prompt(prompted, "carry on", pinned);
    assert.deepEqual([slots(started), get("mode", prompted)], [["tester", "native"], "tester"]);
  });

  test("a switch typed on the first prompt wins over the pin, and the pin does not creep back", () => {
    const session = sid();
    prompt(session, "/mode debug", pinned);
    assert.deepEqual(slots(session), ["debug", "native"]);
    prompt(session, "carry on", pinned);
    assert.equal(get("mode", session), "debug");
  });
});

describe("a dispatcher named up front over a pinned pair", () => {
  const repo = join(tmp, "default-repo");
  write(join(repo, ".mode"), "mode: pair\nstyle: ship\n");
  const first = (text: string): [string[], string[]] => {
    const session = sid();
    prompt(session, text, repo);
    return [
      getSlot({ axis: "mode", session, chip: true }).split("\t"),
      getSlot({ axis: "style", session, chip: true }).split("\t"),
    ];
  };

  test("takes the pin with fast as its style, both marked chosen, while a prompt that only mentions it keeps the pinned pair", () => {
    const [mode, style] = first("you are dispatcher. MF cli, i want lisa and investment tracked as deploys");
    assert.deepEqual([mode[0], mode.at(-1), style[0], style.at(-1)], ["dispatcher", "chosen", "fast", "chosen"]);
    const [kept, keptStyle] = first("let's work on refining pair mode and dispatcher mode");
    assert.deepEqual([kept[0], keptStyle[0]], ["pair", "ship"]);
  });

  test("a style typed beside the switch wins in either order", () => {
    for (const text of ["/mode dispatcher /style edu", "/style edu /mode dispatcher"]) {
      const [mode, style] = first(text);
      assert.deepEqual([mode[0], style[0]], ["dispatcher", "edu"], text);
    }
  });
});

describe("an exit", () => {
  const expiring = readdirSync(join(PLUGIN, "skills", "mode", "modes"))
    .find((file) =>
      /^exit-when:\s*approved\s*$/m.test(readFileSync(join(PLUGIN, "skills", "mode", "modes", file), "utf8")),
    )
    ?.slice(0, -3);

  test(
    "an approval ends a mode waiting on it, says so, and leaves the style",
    { skip: !expiring && "no shipped mode exits on approved" },
    () => {
      const session = sid();
      setSlot({ axis: "mode", session, name: expiring ?? "" });
      setSlot({ axis: "style", session, name: "edu" });
      prompt(session, "working");
      approve({ slug: "a-spec", session });
      const done = prompt(session, "what next");
      assert.notEqual(get("mode", session), expiring);
      assert.ok(/ended/i.test(done.stdout) || done.stdout.includes(expiring ?? ""), done.stdout);
      assert.equal(get("style", session), "edu");
    },
  );

  test(
    "a value a pattern chose returns the slot to auto, so the chooser can pick again",
    { skip: !expiring && "no shipped mode exits on approved" },
    () => {
      const session = sid();
      setSlot({ axis: "style", session, name: "edu" });
      setSlot({ axis: "mode", session, name: expiring ?? "", chosen: true });
      prompt(session, "working");
      approve({ slug: "b-spec", session });
      prompt(session, "what next");
      assert.equal(get("mode", session), "auto");
    },
  );
});

describe("the PostToolUse hooks", () => {
  test("sync rewrites the registry when a contract is saved, in the tree it was saved in", () => {
    const copy = fixtureRoot(join(tmp, "copy"), {
      modes: { solo: contract({ name: "solo" }) },
      styles: { plainstyle: contract({ name: "plainstyle" }) },
      manual:
        "---\nname: mode\n---\n\n<!-- modes:start -->\nold\n<!-- modes:end -->\n\n<!-- styles:start -->\nold\n<!-- styles:end -->\n",
    });
    const real = readFileSync(join(PLUGIN, "skills", "mode", "MANUAL.md"), "utf8");
    const save = (file: string) =>
      fire(
        "sync",
        { hook_event_name: "PostToolUse", tool_name: "Write", cwd: copy, tool_input: { file_path: file } },
        env({ MODE_PLUGIN_ROOT: copy }),
      );
    assert.equal(save(join(copy, "README.md")).status, 0);
    assert.match(readFileSync(join(copy, "skills", "mode", "MANUAL.md"), "utf8"), /old/);
    assert.equal(save(join(copy, "skills", "mode", "modes", "solo.md")).status, 0);
    const registry = readFileSync(join(copy, "skills", "mode", "MANUAL.md"), "utf8");
    assert.ok(registry.includes("solo") && registry.includes("plainstyle") && !registry.includes("old"), registry);
    assert.equal(readFileSync(join(PLUGIN, "skills", "mode", "MANUAL.md"), "utf8"), real);
  });

  test("observe records a .md the conversation wrote and a page or a notebook in the artifacts folder by its slug, and nothing else", () => {
    const doc = write(join(tmp, "notes", "plan.md"), "# Plan\n");
    const code = write(join(tmp, "notes", "plan.ts"), "export const a = 1\n");
    const page = write(join(config, "sidecar", "artifacts", "fresh.html"), "<!doctype html>\n<title>Fresh</title>\n");
    const stray = write(join(tmp, "notes", "stray.html"), "<title>Stray</title>\n");
    const listed = join(config, "artifacts", "session-d0c5e55a");
    const wrote = (file: string) =>
      fire(
        "observe",
        {
          session_id: "d0c5e55a-hook",
          hook_event_name: "PostToolUse",
          tool_name: "Write",
          cwd: tmp,
          tool_input: { file_path: file },
        },
        vars,
      );
    const book = write(join(config, "sidecar", "artifacts", "book.ipynb"), '{"cells":[]}\n');
    assert.equal(wrote(doc).status, 0);
    for (const file of [code, page, stray]) wrote(file);
    fire(
      "observe",
      {
        session_id: "d0c5e55a-hook",
        hook_event_name: "PostToolUse",
        tool_name: "NotebookEdit",
        cwd: tmp,
        tool_input: { notebook_path: book },
      },
      vars,
    );
    assert.deepEqual(readFileSync(listed, "utf8").trim().split("\n"), [doc, "fresh", "book"]);
  });

  test("observe records the step a call satisfied, and a failing suite as test-fail", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "pair" });
    const ran = (command: string, event = "PostToolUse") =>
      fire(
        "observe",
        { session_id: session, hook_event_name: event, tool_name: "Bash", cwd: tmp, tool_input: { command } },
        vars,
      );
    ran("pnpm test", "PostToolUseFailure");
    assert.equal(red(session), "test-fail");
    ran("pnpm test");
    ran("git commit -m wip");
    assert.equal(red(session), undefined);
    assert.ok(declared("mode", session).has("commit"));
  });

  test("observe reads the red a pipe hides, skips a suite that never loaded and a commit that never happened, and an approval passes its step", () => {
    const session = sid();
    setSlot({ axis: "mode", session, name: "copilot" });
    const ran = (command: string, printed = "", event = "PostToolUse") =>
      fire(
        "observe",
        {
          session_id: session,
          hook_event_name: event,
          tool_name: "Bash",
          cwd: tmp,
          tool_input: { command },
          ...(event === "PostToolUse" ? { tool_response: { stdout: printed, stderr: "" } } : { error: printed }),
        },
        vars,
      );
    ran("pnpm test 2>&1 | tail -5", "Tests: 1 failed, 4 passed");
    assert.equal(red(session), "test-fail");
    ran("node --test tests/", "ℹ pass 4\nℹ fail 0\n✖ failing tests:\n⚠ a todo # later");
    assert.equal(red(session), undefined);
    ran("pnpm test", "SyntaxError: Unexpected token", "PostToolUseFailure");
    assert.equal(red(session), undefined);
    ran("git add -A; git commit -m wip", "nothing to commit, working tree clean");
    assert.ok(!declared("mode", session).has("commit"));
    ran("git -C ~/src/app commit -q -m wip");
    assert.ok(declared("mode", session).has("commit"));
    done({ axis: "mode", session, reason: "artifact" });
    approve({ slug: "a-spec", session });
    assert.equal(pipelineFor(session)?.current, "dispatch");
  });
});
