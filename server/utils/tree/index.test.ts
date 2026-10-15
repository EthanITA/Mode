import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { listingOf } from "./index.ts";

let root = "";

before(() => {
  root = mkdtempSync(join(tmpdir(), "tree-"));
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, ".gitignore"), "node_modules/\n*.log\n");
  writeFileSync(join(root, "src", "a.ts"), "");
  writeFileSync(join(root, "debug.log"), "");
  writeFileSync(join(root, "README.md"), "");
});

after(() => rmSync(root, { recursive: true, force: true }));

const names = (showIgnored: boolean): string[] =>
  (listingOf({ root, dir: root, showIgnored })?.entries ?? []).map(
    (one) => `${one.name}${one.kind === "dir" ? "/" : ""}${one.ignored ? " (ignored)" : ""}`,
  );

test("a folder lists dirs first, leaves out what git ignores, and the .git folder never shows", () => {
  assert.deepEqual(names(false), ["src/", ".gitignore", "README.md"]);
});

test("showing ignored brings them back, marked", () => {
  assert.deepEqual(names(true), ["node_modules/ (ignored)", "src/", ".gitignore", "debug.log (ignored)", "README.md"]);
});

test("a folder outside the root is refused", () => {
  assert.equal(listingOf({ root: join(root, "src"), dir: root, showIgnored: false }), undefined);
});
