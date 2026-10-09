import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReviewFile } from "../../shared/types/review.ts";
import { Review } from "./review.ts";

const file: ReviewFile = {
  path: "/r/a",
  turns: [1],
  original: ["a", "b", "c", "d"],
  current: ["a", "B", "C", "d", "e"],
  changes: [
    { oldStart: 1, oldEnd: 3, newStart: 1, newEnd: 3 },
    { oldStart: 4, oldEnd: 4, newStart: 4, newEnd: 5 },
  ],
};

test("a picked row becomes the 1-based line numbers of both of its sides", () => {
  assert.deepEqual(Review.picksOf(file, ["n1"]), { old: [2], new: [2] });
  assert.deepEqual(Review.picksOf(file, ["n4"]), { old: [], new: [5] });
  assert.deepEqual(Review.hunkOf(file, 0), { old: [2, 3], new: [2, 3] });
});

test("the tree hangs files under their shared root, merges single-folder chains and hides what is collapsed", () => {
  const at = (path: string): ReviewFile => ({ ...file, path });
  const files = [at("/r/app/utils/a.ts"), at("/r/app/utils/b.ts"), at("/r/docs/deep/only/c.md"), at("/r/top.md")];
  const shape = (collapsed: string[]): string[] =>
    Review.tree({ files, collapsed }).map((row) => `${"  ".repeat(row.depth)}${row.name}${row.kind === "dir" ? ` (${row.count})` : ""}`);
  assert.deepEqual(shape([]), [
    "/r (4)",
    "  app/utils (2)",
    "    a.ts",
    "    b.ts",
    "  docs/deep/only (1)",
    "    c.md",
    "  top.md",
  ]);
  assert.deepEqual(shape(["/r/app/utils"]), ["/r (4)", "  app/utils (2)", "  docs/deep/only (1)", "    c.md", "  top.md"]);
});

test("compact view folds a long unchanged run and keeps three lines of context", () => {
  const long: ReviewFile = {
    ...file,
    original: Array.from({ length: 20 }, (_, i) => `l${i}`),
    current: Array.from({ length: 20 }, (_, i) => (i === 10 ? "X" : `l${i}`)),
    changes: [{ oldStart: 10, oldEnd: 11, newStart: 10, newEnd: 11 }],
  };
  const kinds = Review.rows({ file: long, isCompact: true, unfolded: [] }).map((row) => row.kind);
  assert.deepEqual(kinds, ["fold", "same", "same", "same", "change", "same", "same", "same", "fold"]);
  assert.equal(Review.rows({ file: long, isCompact: false, unfolded: [] }).length, 20);
  assert.equal(Review.rows({ file: long, isCompact: true, unfolded: ["fold:0"] }).length, 15);
});
