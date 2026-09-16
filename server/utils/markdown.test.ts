import assert from "node:assert/strict"
import test from "node:test"
import { Markdown } from "./markdown.ts"

test("a fenced code block is syntax highlighted, by its fence language", async () => {
  const html = await Markdown.body("```python\ndef f(x):\n    return x\n```")
  assert.match(html, /class="shj-syn-kwd">def</)
  assert.match(html, /<code class="language-python">/)
})

test("a highlighted fence still escapes HTML-sensitive characters in the code", async () => {
  const html = await Markdown.body('```js\nif (a < b) { return "<x>" }\n```')
  assert.match(html, /&lt;x&gt;/)
  assert.doesNotMatch(html, /<x>/)
})
