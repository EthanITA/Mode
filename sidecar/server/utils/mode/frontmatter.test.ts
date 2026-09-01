import assert from "node:assert/strict"
import { test } from "node:test"
import { splitFrontMatter, unquote } from "./frontmatter.ts"

test("splits meta from body and unquotes values", () => {
  const { meta, body } = splitFrontMatter('---\nname: demo\nsummary: "a quoted value"\n---\n\n# Body\n')
  assert.deepEqual(meta, { name: "demo", summary: "a quoted value" })
  assert.equal(body, "# Body")
})

test("treats an unterminated fence as body, not front matter", () => {
  const { meta, body } = splitFrontMatter("---\nname: demo\n\n# No closing fence")
  assert.deepEqual(meta, {})
  assert.equal(body, "---\nname: demo\n\n# No closing fence")
})

test("text with no fence at all is pure body", () => {
  const { meta, body } = splitFrontMatter("just a body\nwith two lines")
  assert.deepEqual(meta, {})
  assert.equal(body, "just a body\nwith two lines")
})

test("unquote strips one matching pair, never a lone quote", () => {
  assert.equal(unquote('"quoted"'), "quoted")
  assert.equal(unquote("'quoted'"), "quoted")
  assert.equal(unquote('"mismatched\''), "\"mismatched'")
  assert.equal(unquote("  spaced  "), "spaced")
})
