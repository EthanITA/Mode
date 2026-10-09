import assert from "node:assert/strict";
import { test } from "node:test";
import { Tree } from "./tree.ts";

test("paths hang under their shared folder, dirs before files, and a folder holding one folder merges into it", () => {
  const tree = Tree.fromPaths(["/r/top.md", "/r/app/utils/b.ts", "/r/app/utils/a.ts", "/r/docs/deep/only/c.md"]);
  assert.equal(tree?.root, "/r");
  const names = (dir: string): string[] => (tree?.children.get(dir) ?? []).map((one) => one.name);
  assert.deepEqual(names("/r"), ["app/utils", "docs/deep/only", "top.md"]);
  assert.deepEqual(names("/r/app/utils"), ["a.ts", "b.ts"]);
  assert.deepEqual(names("/r/docs/deep/only"), ["c.md"]);
});

test("no paths is no tree", () => {
  assert.equal(Tree.fromPaths([]), undefined);
});
