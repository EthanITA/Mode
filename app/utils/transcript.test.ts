import assert from "node:assert/strict";
import { test } from "node:test";
import { echoesNote, freshAnswer, turnSegments } from "./transcript.ts";

test("a wrapper folds to its own row and the prose either side survives", () => {
  const got = turnSegments("hi\n\n<command-name>/code-review</command-name>\n\nbye");
  assert.deepEqual(got.map((one) => one.kind), ["prose", "block", "prose"]);
  assert.deepEqual(got[1], { body: "/code-review", kind: "block", summary: "/code-review", tag: "command-name" });
});

test("a wrapper inside a fence or inline code is code being discussed, not noise", () => {
  const fenced = "```html\n<system-reminder>fake</system-reminder>\n```";
  assert.deepEqual(turnSegments(fenced).map((one) => one.kind), ["prose"]);
  assert.deepEqual(turnSegments("the `<command-name>x</command-name>` tag").map((one) => one.kind), ["prose"]);
});

test("an unterminated wrapper stays literal rather than swallowing the rest of the turn", () => {
  assert.deepEqual(turnSegments("text <system-reminder>never closed"), [
    { kind: "prose", text: "text <system-reminder>never closed" },
  ]);
});

test("adjacent wrappers are separate rows with no blank prose between them", () => {
  const got = turnSegments("<command-name>a</command-name>\n<command-name>b</command-name>");
  assert.deepEqual(got.map((one) => one.kind), ["block", "block"]);
  assert.deepEqual(got.map((one) => (one.kind === "block" ? one.body : "")), ["a", "b"]);
});

test("angle-bracketed prose is not a wrapper, so placeholders are left alone", () => {
  const said = "write `artifacts/<slug>.html` and <name> too";
  assert.deepEqual(turnSegments(said), [{ kind: "prose", text: said }]);
});

test("a multi-line body is summarised to one line and counted, never dropped", () => {
  const [block] = turnSegments("<local-command-stdout>first\nsecond\nthird</local-command-stdout>");
  assert.equal(block?.kind === "block" && block.summary, "first second third · 3 lines");
  assert.equal(block?.kind === "block" && block.body, "first\nsecond\nthird");
});

test("a skill invocation is one block named from the directory, body kept whole", () => {
  const text = "Base directory for this skill: /Users/madong/.claude/skills/mode/skills/edge-induction\n\n# Edge Induction\nFind the edge cases.";
  assert.deepEqual(turnSegments(text), [
    { body: text, kind: "block", summary: "edge-induction · 4 lines", tag: "skill" },
  ]);
});

test("the skill-directory phrase mid-prose is left as prose", () => {
  const said = "quoted Base directory for this skill: /tmp/edge-induction in the logs";
  assert.deepEqual(turnSegments(said), [{ kind: "prose", text: said }]);
});

test("a wrapper inside a skill body is not carved out of the skill block", () => {
  const text = "Base directory for this skill: /Users/madong/.claude/skills/mode/skills/edge-induction\n\n```html\n<system-reminder>fake</system-reminder>\n```";
  assert.deepEqual(turnSegments(text), [
    { body: text, kind: "block", summary: "edge-induction · 5 lines", tag: "skill" },
  ]);
});

test("the answer that arrived last wins even when the clock says otherwise", () => {
  const said = { kind: "answer", role: "assistant", text: "done" };
  assert.equal(freshAnswer([{ role: "user", text: "go" }, said]), said);
  assert.equal(freshAnswer([said, { role: "user", text: "again" }]), undefined);
  assert.equal(freshAnswer([]), undefined);
});

test("a system note between the ask and the reply leaves the answer standing", () => {
  const said = { kind: "answer", role: "assistant", text: "done" };
  const turns = [{ role: "user", text: "go" }, said, { kind: "note", role: "system", text: "Compacted" }];
  assert.equal(freshAnswer(turns), said);
});

test("only a note repeated back to back is an echo", () => {
  const note = { kind: "note", role: "system", text: "Command(compact)" };
  assert.equal(echoesNote(note, { ...note }), true);
  assert.equal(echoesNote(note, undefined), false);
  assert.equal(echoesNote(note, { role: "assistant", text: "Command(compact)" }), false);
});
