import assert from "node:assert/strict";
import { test } from "node:test";
import { Tree } from "./tree.ts";

test("paths hang under their shared folder, dirs before files, and a folder holding one folder merges into it", () => {
  const tree = Tree.fromPaths(["/r/top.md", "/r/app/utils/b.ts", "/r/app/utils/a.ts", "/r/docs/deep/only/c.md"]);
  const names = (dir: string): string[] => (tree?.children.get(dir) ?? []).map((one) => one.name);
  assert.deepEqual(names(tree?.root ?? ""), ["r"]);
  assert.deepEqual(names("/r"), ["app/utils", "docs/deep/only", "top.md"]);
  assert.deepEqual(names("/r/app/utils"), ["a.ts", "b.ts"]);
  assert.deepEqual(names("/r/docs/deep/only"), ["c.md"]);
});

test("files from one folder still hang under that folder", () => {
  const tree = Tree.fromPaths(["/r/app/b.ts", "/r/app/a.ts"]);
  assert.deepEqual(tree?.children.get(tree.root)?.map((one) => one.path), ["/r/app"]);
  assert.deepEqual(tree?.children.get("/r/app")?.map((one) => one.name), ["a.ts", "b.ts"]);
});

test("no paths is no tree", () => {
  assert.equal(Tree.fromPaths([]), undefined);
});
