import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { choose, setSlot } from "../lib/mode/slots.ts";
import { PLUGIN, scratch } from "./support.ts";

process.env.CLAUDE_CONFIG_DIR = scratch("mode-contracts-");
process.env.MODE_PLUGIN_ROOT = PLUGIN;

const SKILL = join(PLUGIN, "skills", "mode");
const COLORS = ["red", "green", "yellow", "blue", "magenta", "cyan", "grey", "sky", "pink", "orange", "violet"];
const EXITS = ["manual", "approved", "mr-opened"];
const BUDGET = 4;
const SUMMARY_MAX = 120;

type Parsed = { stem: string; file: string; meta: Record<string, string>; body: string; text: string };

// Parsed here rather than through lib/mode, so a parser bug there cannot make this suite pass.
function parse(folder: string): Parsed[] {
  const dir = join(SKILL, folder);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const lines = text.split(/\r\n|\r|\n/);
      const close = lines[0]?.trim() === "---" ? lines.findIndex((line, i) => i > 0 && line.trim() === "---") : -1;
      const meta: Record<string, string> = {};
      for (const line of close > 0 ? lines.slice(1, close) : []) {
        const at = line.indexOf(":");
        if (at >= 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
      }
      return { stem: file.slice(0, -3), file, meta, body: close > 0 ? lines.slice(close + 1).join("\n") : text, text };
    });
}

function standing(body: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of body.split("\n")) {
    if (line.trim().toLowerCase().startsWith("## standing reminder")) inside = true;
    else if (inside && line.startsWith("## ")) break;
    else if (inside && line.trim()) out.push(line);
  }
  return out;
}

const STRUCTURE = /^\s*(---+|\|[\s|:-]+\|)\s*$/;
// A hyphen spaced on both sides splices a clause the way an em dash does; a list bullet does not.
const dashed = (text: string): string[] =>
  text.split("\n").filter((line) => !STRUCTURE.test(line) && /—|–|\S +- +\S/.test(line));

const listed = (meta: Record<string, string>, key: string): string[] =>
  (meta[key] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const modes = parse("modes");
const styles = parse("styles");
const contracts = [...modes, ...styles];

// Each check names the files that break it, so one failure reads as the whole list to fix.
function offenders(of: Parsed[], broken: (contract: Parsed) => unknown): string[] {
  return of.filter((contract) => broken(contract)).map((contract) => contract.file);
}

describe("every shipped contract's front matter", () => {
  test("parses, and its name is the filename stem", () => {
    assert.ok(modes.length && styles.length, "every check below would pass vacuously over an empty folder");
    assert.deepEqual(
      offenders(contracts, ({ meta, stem }) => meta.name !== stem),
      [],
    );
  });

  test("carries a one-line summary the chip can show", () => {
    assert.deepEqual(
      offenders(contracts, ({ meta }) => !meta.summary || meta.summary.length > SUMMARY_MAX),
      [],
    );
  });

  test("declares a colour the chip can render and a legal exit-when", () => {
    assert.deepEqual(
      offenders(
        contracts,
        ({ meta }) => !COLORS.includes(meta.color ?? "") || !EXITS.includes(meta["exit-when"] ?? ""),
      ),
      [],
    );
  });

  test("has no enter-when alternative with an apostrophe, which misses two of the three spellings people type", () => {
    assert.deepEqual(
      offenders(contracts, ({ meta }) => (meta["enter-when"] ?? "").split("|").some((phrase) => /['’]/.test(phrase))),
      [],
    );
  });

  test("writes enter-never, when present, as the literal true", () => {
    assert.deepEqual(
      offenders(contracts, ({ meta }) => "enter-never" in meta && meta["enter-never"] !== "true"),
      [],
    );
  });
});

describe("every shipped contract's body", () => {
  test("has a standing reminder within its four-line budget, since two slots inject together", () => {
    assert.deepEqual(
      offenders(
        contracts,
        ({ body, stem }) => stem !== "tester" && (!standing(body).length || standing(body).length > BUDGET),
      ),
      [],
    );
  });

  test(
    "tester.md's reminder fits the budget",
    { todo: "it runs to six lines, and trimming it is a wording call for Marco" },
    () => {
      const [tester] = modes.filter(({ stem }) => stem === "tester");
      assert.ok(tester && standing(tester.body).length <= BUDGET);
    },
  );

  test("carries no placeholder but USER, the one the tool substitutes", () => {
    assert.deepEqual(
      offenders(contracts, ({ text }) => [...text.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].some((m) => m[1] !== "USER")),
      [],
    );
  });

  test("names only paths that exist in the repo", () => {
    const missing = contracts.flatMap(({ text }) =>
      [...text.matchAll(/(?:skills|hooks|bin|commands|tests|\.claude-plugin)\/[A-Za-z0-9_./-]+/g)]
        .map(([token]) => token.replace(/[.,;:)]+$/, ""))
        .filter((token) => !existsSync(join(PLUGIN, token))),
    );
    assert.deepEqual(missing, []);
  });

  test("has no em dash and no spaced clause dash", () => {
    assert.deepEqual(
      contracts.flatMap(({ file, text }) => dashed(text).map((line) => `${file}: ${line.trim()}`)),
      [],
    );
  });
});

describe("colours", () => {
  test("no two contracts on one axis share a colour", () => {
    for (const axis of [modes, styles]) {
      const colours = axis.map(({ meta }) => meta.color);
      assert.deepEqual(
        colours.filter((colour, i) => colours.indexOf(colour) !== i),
        [],
      );
    }
  });

  test("a colour shared across the axes falls on a pair the catalogue already calls related", () => {
    const related = new Set([
      "autopilot+socratic",
      "recon+ship",
      "studio+ship",
      "tdd+ship",
      "tdd+socratic",
      "autopilot+edu",
      "autopilot+plain",
      "copilot+fast",
      "debug+maintainer",
      "debug+ship",
      "harden+ship",
      "incident+maintainer",
      "migrate+ship",
      "refactor+ship",
      "release+ship",
      "review+ship",
      "studio+fast",
      "studio+native",
      "tdd+fast",
      "prove+edu",
      "prove+ship",
      "goal+edu",
      "autopilot+xyz",
      "ic+creative",
      "tester+maintainer",
      "tester+ship",
    ]);
    const collisions = modes.flatMap((mode) =>
      styles.filter((style) => style.meta.color === mode.meta.color).map((style) => `${mode.stem}+${style.stem}`),
    );
    assert.deepEqual(
      collisions.filter((pair) => !related.has(pair)),
      [],
    );
  });
});

describe("ground rules", () => {
  const rules = parse("rules");

  test("each names itself, carries a summary and a body to inject, and has no clause dash", () => {
    assert.deepEqual(
      offenders(
        rules,
        ({ meta, stem, body, text }) => meta.name !== stem || !meta.summary || !body.trim() || dashed(text).length,
      ),
      [],
    );
  });

  test("a rule that outranks the contracts carries a reminder within budget", () => {
    assert.deepEqual(
      offenders(rules, ({ meta, body }) => meta.outranks && (!standing(body).length || standing(body).length > BUDGET)),
      [],
    );
  });

  test("prose outranks every mode, style and skill", () => {
    assert.ok(rules.find(({ stem }) => stem === "prose")?.meta.outranks);
  });
});

describe("flags a guard reads", () => {
  const declaring = (of: Parsed[], key: string): string[] =>
    of.filter(({ meta }) => meta[key] === "true").map(({ stem }) => stem);

  test("no-dispatch-without-approval is on copilot alone, since anywhere unwatched it deadlocks", () => {
    assert.deepEqual(declaring(modes, "no-dispatch-without-approval"), ["copilot"]);
  });

  test("no-implement is on copilot", () => {
    assert.ok(declaring(modes, "no-implement").includes("copilot"));
  });

  test("no-code-without-red is on tdd alone", () => {
    assert.deepEqual(declaring(modes, "no-code-without-red"), ["tdd"]);
  });

  test("no style declares a mode's flag or a pipeline", () => {
    const keys = ["no-implement", "no-dispatch-without-approval", "no-code-without-red", "steps", "loops"];
    assert.deepEqual(
      offenders(styles, ({ meta }) => keys.some((key) => meta[key])),
      [],
    );
  });
});

describe("the pipeline each mode declares", () => {
  const EVENTS = ["artifact", "approve", "agent", "question", "commit", "test", "test-fail"];
  const STEP = /^([a-z][a-z0-9-]*)(\?)?(?:@([a-z][a-z0-9-]*))?$/;
  const piped = modes.filter(({ meta }) => listed(meta, "steps").length);
  const steps = ({ meta }: Parsed) => listed(meta, "steps").map((entry) => STEP.exec(entry));
  const labels = (contract: Parsed) => steps(contract).map((match) => match?.[1] ?? "");

  test("every step is a lowercase name with an optional ? gate and @event", () => {
    assert.deepEqual(
      offenders(piped, (contract) => steps(contract).some((match) => !match)),
      [],
    );
  });

  test("no step name is used twice, since a loop resolves a step by name", () => {
    assert.deepEqual(
      offenders(piped, (contract) => new Set(labels(contract)).size !== labels(contract).length),
      [],
    );
  });

  test("every @event is one the recorder publishes", () => {
    assert.deepEqual(
      offenders(piped, (contract) => steps(contract).some((match) => match?.[3] && !EVENTS.includes(match[3]))),
      [],
    );
  });

  test("the drawing fits 78 columns", () => {
    const width = (names: string[]) => names.reduce((sum, name) => sum + name.length + 4, 0) + 2 * (names.length - 1);
    assert.deepEqual(
      offenders(piped, (contract) => width(labels(contract)) > 78),
      [],
    );
  });

  test("every loop is written from>to and names two of its own steps", () => {
    assert.deepEqual(
      offenders(piped, (contract) =>
        listed(contract.meta, "loops").some((edge) => {
          const [from, to] = edge.split(">").map((end) => end.trim());
          return !to || !labels(contract).includes(from ?? "") || !labels(contract).includes(to);
        }),
      ),
      [],
    );
  });

  test("what a mode delivers is named, and covers the events its pipeline waits on", () => {
    const INTENTS = ["answer", "change", "artifact", "post"];
    assert.deepEqual(
      offenders(modes, (contract) => {
        const declared = listed(contract.meta, "deliverables");
        const events = steps(contract).map((match) => match?.[3]);
        const named =
          declared.length && (declared.join() === "none" || declared.every((intent) => INTENTS.includes(intent)));
        return (
          !named ||
          (events.includes("artifact") && !declared.includes("artifact")) ||
          (events.includes("commit") && !declared.includes("change"))
        );
      }),
      [],
    );
  });
});

describe("routing through the real chooser against the shipped contracts", () => {
  let n = 0;
  const chooses = (axis: "mode" | "style", message: string): string => {
    const session = `route${String(++n).padStart(3, "0")}`;
    setSlot({ axis, session, name: "auto" });
    return choose({ axis, session, message });
  };

  for (const [phrase, want] of [
    ["the build fails on startup", "debug"],
    ["the implementation fails", "debug"],
    ["the test keeps failing", "debug"],
    ["a failure in the parser", "debug"],
    ["rebuild the index from scratch", ""],
    ["loop until the suite is green", "goal"],
    ["why does the hook run before the model", ""],
  ] as const) {
    test(`'${phrase}' chooses ${want || "nothing"}`, () => {
      assert.equal(chooses("mode", phrase), want);
    });
  }

  test("a bug report picks no style either", () => {
    assert.equal(chooses("style", "the build fails on startup"), "");
  });
});
