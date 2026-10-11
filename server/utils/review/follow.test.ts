import assert from "node:assert/strict";
import { test } from "node:test";
import { hasForegroundClaude, pointAt, POINT_TTL_MS, standingTarget } from "./follow.ts";

test("a tab counts only while claude holds its terminal in the foreground", () => {
  assert.equal(hasForegroundClaude("Ss   login -pfl madong\nS    -zsh\nS+   claude\n"), true);
  assert.equal(hasForegroundClaude("Ss   login -pfl madong\nS+   -zsh\n"), false);
  assert.equal(hasForegroundClaude("S    claude\nS+   -zsh\n"), false);
});

test("a point stands while fresh and lapses to idle after the ttl", () => {
  assert.equal(standingTarget().source, "none");
  pointAt({ key: "abcdef12", source: "claude" });
  assert.equal(standingTarget().key, "abcdef12");
  assert.deepEqual(standingTarget(Date.now() + POINT_TTL_MS + 1), { source: "none" });
});
