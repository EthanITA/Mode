import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, before, test } from "node:test"
import { FIXTURES_DIR, useFixtures } from "./__fixtures__/env.ts"
import { resolveDir } from "./paths.ts"
import { pins } from "./pins.ts"

// Written from the resolved paths rather than hardcoded, so the fixture survives whichever of
// ~/.claude/skills/mode or the real Notes checkout this file is reached through.
const REPO = resolveDir(join(FIXTURES_DIR, "repo"))
const NESTED = resolveDir(join(FIXTURES_DIR, "repo", "nested"))

const PINS_FILE = join(FIXTURES_DIR, "config", "mode", "pins.tsv")

before(() => {
  writeFileSync(PINS_FILE, `${NESTED}\tmode\tgated\n${REPO}\tstyle\toff\n`)
})

let restore: () => void
afterEach(() => restore?.())

test("a personal pin at the exact folder beats the shared .mode above it", () => {
  restore = useFixtures()
  const result = pins(NESTED)
  assert.equal(result.mode.name, "gated")
  assert.equal(result.mode.layer, "personal")
  assert.equal(result.mode.file, PINS_FILE)
})

test("a personal off masks the shared pin in the very same folder", () => {
  restore = useFixtures()
  const result = pins(REPO)
  assert.deepEqual(result.style, { layer: "off", file: REPO })
})

test("no personal row anywhere in the ancestry falls through to the shared .mode file", () => {
  restore = useFixtures()
  // repo/other sits outside both personal rows, so this climbs straight to REPO's shared .mode.
  const result = pins(join(REPO, "other"))
  assert.equal(result.mode.name, "demo")
  assert.equal(result.mode.layer, "shared")
  assert.equal(result.mode.file, join(REPO, ".mode"))
})

test("nothing pinned anywhere above the folder reads as an empty slot", () => {
  restore = useFixtures()
  const result = pins(join(FIXTURES_DIR, "lonely"))
  assert.deepEqual(result.mode, {})
  assert.deepEqual(result.style, {})
})
