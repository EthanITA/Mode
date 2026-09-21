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

test("a mermaid fence is drawn as an svg whose block holds labels, with its CSS after the sections", async () => {
  const html = await Markdown.body("```mermaid\nflowchart LR\n  A[add Tesla<br/>to my watchlist] -- yes --> B{empty?}\n```")
  const block = html.slice(html.indexOf('<div class="diagram"'), html.indexOf("</section>"))
  assert.match(block, /<svg [^>]*--bg:var\(--page-bg\)/)
  assert.match(block, /add Tesla/)
  assert.doesNotMatch(block, /<style/)
  assert.match(html, /<\/section>\n<style>[^<]*--_text/)
  assert.doesNotMatch(html, /googleapis/)
})

test("a mermaid type the renderer cannot draw keeps its fenced source", async () => {
  const html = await Markdown.body('```mermaid\npie title Pets\n  "Dogs" : 386\n```')
  assert.match(html, /<code class="language-mermaid">/)
  assert.doesNotMatch(html, /<svg/)
})
