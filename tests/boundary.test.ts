import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIDES = {
  sidecar: ["app/", "server/", "shared/", "desktop/", "lib/sidecar/", "lib/web/", "bin/_sidecar.ts", "bin/versions.ts"],
  mode: [
    "lib/mode/",
    "lib/hook/",
    "lib/style/",
    "lib/artifact/",
    "hooks/",
    "bin/_mode.ts",
    "bin/_artifact.ts",
    "tests/",
  ],
};
const SPECIFIER = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s+["']([^"']+)["']/gm;

type Side = keyof typeof SIDES;

const sideOf = (path: string): Side | undefined =>
  (Object.keys(SIDES) as Side[]).find((side) => SIDES[side].some((prefix) => path.startsWith(prefix)));

const target = (file: string, specifier: string): string | undefined => {
  if (specifier.startsWith("~~/")) return normalize(specifier.slice(3));
  if (specifier.startsWith("~/")) return normalize(join("app", specifier.slice(2)));
  if (specifier.startsWith(".")) return relative(ROOT, join(ROOT, dirname(file), specifier));
  return undefined;
};

test("the sidecar and the modes system never import each other's code", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT })
    .toString()
    .split("\n")
    .filter((file) => /\.(ts|tsx|mts|vue)$/.test(file) && sideOf(file));
  const crossings: string[] = [];
  for (const file of files) {
    const from = sideOf(file);
    for (const match of readFileSync(join(ROOT, file), "utf8").matchAll(SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? match[3] ?? "";
      const to = sideOf(target(file, specifier) ?? "");
      if (to && to !== from) crossings.push(`${file} imports ${specifier}`);
    }
  }
  assert.ok(files.length > 100, `only ${files.length} files classified`);
  assert.deepEqual(crossings, []);
});
