import assert from "node:assert/strict";
import { test } from "node:test";
import { askClaudeHistory, askClaudeQuestion, askClaudeState, type AskClaudeTurn } from "./ask-claude.ts";

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
