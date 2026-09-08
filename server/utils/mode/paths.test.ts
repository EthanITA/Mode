import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { FIXTURES_DIR } from "./__fixtures__/env.ts"
import { resolvePluginRoot } from "./paths.ts"

const PLUGIN = join(FIXTURES_DIR, "plugin")

test("climbs from deep inside the tree to the folder carrying .claude-plugin/plugin.json", () => {
  const start = join(PLUGIN, "skills", "mode", "modes")
  assert.equal(resolvePluginRoot(start, "unused"), PLUGIN)
})

test("falls back to the guess when the guess itself holds skills/mode", () => {
  // tmpdir climbs to the filesystem root without ever finding a plugin manifest.
  assert.equal(resolvePluginRoot(tmpdir(), PLUGIN), PLUGIN)
})

test("throws, naming what it searched, when neither the climb nor the guess finds anything", () => {
  assert.throws(() => resolvePluginRoot(tmpdir(), join(tmpdir(), "nowhere")), /plugin root not found/)
})
