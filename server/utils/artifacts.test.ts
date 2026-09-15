import assert from "node:assert/strict"
import { test } from "node:test"
import { applyReviewChange } from "./artifacts.ts"
import { Markdown } from "./markdown.ts"

const NOTE = "<!-- artifact\ntitle:   The plan\n-->\n# The plan\n\nShip it <b>today</b>.\n\n## Risks\n\n- [ ] a < b\n"

test("a .md takes its first thread with no layer installed, below its own text, in one block", () => {
  const made = applyReviewChange({ action: "create", body: "why today", format: "md", text: NOTE })
  if (!made.ok || !made.thread) assert.fail(`create refused: ${JSON.stringify(made)}`)
  assert.ok(made.text.startsWith(NOTE))

  const replied = applyReviewChange({ action: "reply", body: "the window closes", format: "md", id: made.thread.id, text: made.text })
  if (!replied.ok) assert.fail(replied.reason)
  assert.equal(replied.text.split("<!-- rv:seed").length, 2)
  assert.deepEqual(replied.threads.map((one) => [one.body, one.replies.length]), [["why today", 1]])
})

test("the page is one section per h1 or h2, and no comment block leaks into it", async () => {
  const made = applyReviewChange({ action: "create", body: "before --> after", format: "md", text: NOTE })
  if (!made.ok) assert.fail(made.reason)
  const page = await Markdown.page({ markdown: made.text, title: "The plan" })
  const body = page.slice(page.indexOf("<body>"))
  assert.equal(body.split("<section").length, 3)
  assert.ok(!body.includes("after") && !body.includes("title:"), body)
  assert.ok(body.includes("<b>today</b>") && body.includes("a &lt; b"), body)
})
