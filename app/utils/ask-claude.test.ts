import assert from "node:assert/strict";
import { test } from "node:test";
import {
  askClaudeHistory,
  askClaudeQuestion,
  askClaudeState,
  SideQuestion,
  type AskClaudeTurn,
  type SideAnchor,
  type SideThread,
} from "./ask-claude.ts";

const IO: SideAnchor = {
  label: "io.ts:12-17",
  lines: [9, 10],
  place: "~/src/mode/lib/hook/io.ts",
  quote: "  let size = 0;\n  for await (const chunk of process.stdin) {",
  surface: "review",
  where: "lines 9-10 of ~/src/mode/lib/hook/io.ts",
};

function threadOf(turns: AskClaudeTurn[], status: SideThread["status"] = "open"): SideThread {
  return { anchor: IO, draft: "", id: "t", key: "k", status, turns };
}

test("the side chat's state comes off the turn in view, never off the session", () => {
  assert.equal(askClaudeState(), "idle");
  assert.equal(askClaudeState({ id: "1", question: "q" }), "asking");
  assert.equal(askClaudeState({ id: "1", question: "q", answer: "a" }), "answered");
  assert.equal(askClaudeState({ id: "1", question: "q", failure: "no" }), "failed");
});

test("history carries only answered turns, the newest twenty", () => {
  const turns: AskClaudeTurn[] = Array.from({ length: 23 }, (_, at) => ({
    id: `${at}`,
    question: `q${at}`,
    answer: `a${at}`,
  }));
  turns.push({ id: "x", question: "failed", failure: "no" }, { id: "y", question: "asking" });
  const history = askClaudeHistory(turns);
  assert.equal(history.length, 20);
  assert.deepEqual(history.at(-1), { question: "q22", response: "a22" });
});

test("a leading /btw is the TUI habit and is dropped, anywhere else it is part of the question", () => {
  assert.equal(askClaudeQuestion("  /btw why is the cap 1 MB?"), "why is the cap 1 MB?");
  assert.equal(askClaudeQuestion("what does /btw do?"), "what does /btw do?");
  assert.equal(askClaudeQuestion("/btw"), "");
});

test("a side question numbers the picked lines from the span, so a line the answer names is the file's", () => {
  const prompt = SideQuestion.promptOf(IO, "Why 1 MB?");
  assert.match(prompt, /^About lines 9-10 of ~\/src\/mode\/lib\/hook\/io\.ts:/);
  assert.match(prompt, /\n 9    let size = 0;\n10    for await/);
  assert.match(prompt, /\n\nWhy 1 MB\?$/);
  assert.match(
    SideQuestion.promptOf({ ...IO, lines: undefined, quote: "Sessions drift" }, "q"),
    /\n> Sessions drift\n/,
  );
});

test("history replays what went to Claude, so a follow-up keeps the code the first question carried", () => {
  const [first] = askClaudeHistory([{ answer: "a", id: "1", prompt: "About io.ts …", question: "Why?" }]);
  assert.equal(first?.question, "About io.ts …");
});

test("line refs read as spans, and a ref inside code stays code", () => {
  assert.deepEqual(SideQuestion.linesNamed("io.ts", "See line 14, then lines 15–16 and lines 18 to 17."), [
    [14, 14],
    [15, 16],
    [17, 18],
  ]);
  const nodes = SideQuestion.withLineRefs([["p", {}, "at line 14 ", ["code", {}, "line 15"]]], "io.ts");
  assert.deepEqual(nodes, [
    ["p", {}, "at ", ["line-ref", { from: 14, to: 14 }, "line 14"], " ", ["code", {}, "line 15"]],
  ]);
  assert.deepEqual(SideQuestion.linesNamed("io.ts", "It mirrors line 88 of `ask-claude.ts`, see line 9 of io.ts."), [
    [9, 9],
  ]);
  assert.deepEqual(SideQuestion.linesNamed("io.ts", "As line 88 in ~/src/mode/lib/guard.ts does."), []);
  assert.deepEqual(SideQuestion.withLineRefs([["p", {}, "like line 88 of ", ["code", {}, "guard.ts"]]], "io.ts"), [
    ["p", {}, "like line 88 of ", ["code", {}, "guard.ts"]],
  ]);
});

test("the card's state comes off its status and its newest turn", () => {
  assert.equal(SideQuestion.stateOf(threadOf([])), "empty");
  assert.equal(SideQuestion.stateOf(threadOf([{ id: "1", question: "q" }])), "asking");
  assert.equal(SideQuestion.stateOf(threadOf([{ answer: "a", id: "1", question: "q" }])), "answered");
  assert.equal(
    SideQuestion.stateOf(
      threadOf([
        { answer: "a", id: "1", question: "q" },
        { id: "2", question: "q2" },
      ]),
    ),
    "followup",
  );
  assert.equal(SideQuestion.stateOf(threadOf([{ failure: "no", id: "1", question: "q" }])), "failed");
  assert.equal(SideQuestion.stateOf(threadOf([{ answer: "a", id: "1", question: "q" }], "resolved")), "resolved");
});

test("the handover names the place with a short quote, the answered exchanges, then what is still in the field", () => {
  const text = SideQuestion.handoverOf({
    ...threadOf([
      { answer: "It caps the input.", id: "1", prompt: "About …", question: "What does it do?" },
      { failure: "no", id: "2", question: "Why?" },
    ]),
    draft: "  Raise it to 4 MB.  ",
  });
  assert.equal(
    text,
    "I asked a blank Claude on the side about lines 9-10 of ~/src/mode/lib/hook/io.ts (“let size = 0; for await (const chunk of process.stdin) {”).\nI asked: What does it do?\nClaude answered: It caps the input.\n\nRaise it to 4 MB.",
  );
});
