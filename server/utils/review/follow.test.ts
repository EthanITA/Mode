import assert from "node:assert/strict";
import { test } from "node:test";
import { pointAt, POINT_TTL_MS, standingTarget } from "./follow.ts";

test("a point stands while fresh and lapses to idle after the ttl", () => {
  assert.equal(standingTarget().source, "none");
  pointAt({ key: "abcdef12", source: "claude" });
  assert.equal(standingTarget().key, "abcdef12");
  assert.deepEqual(standingTarget(Date.now() + POINT_TTL_MS + 1), { source: "none" });
});
