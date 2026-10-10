import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readComments } from "../../lib/sidecar/comments.ts";
import { applyReviewChange, applyStoredReview, listArtifacts } from "./artifacts.ts";
import { Markdown } from "./markdown.ts";
import { Documents } from "./sessions/artifact-lists.ts";

const NOTE = "<!-- artifact\ntitle:   The plan\n-->\n# The plan\n\nShip it <b>today</b>.\n\n## Risks\n\n- [ ] a < b\n";

test("a .md takes its first thread with no layer installed, below its own text, in one block", () => {
  const made = applyReviewChange({ action: "create", body: "why today", format: "md", text: NOTE });
  if (!made.ok || !made.thread) assert.fail(`create refused: ${JSON.stringify(made)}`);
  assert.ok(made.text.startsWith(NOTE));

  const replied = applyReviewChange({
    action: "reply",
    body: "the window closes",
    format: "md",
    id: made.thread.id,
    text: made.text,
  });
  if (!replied.ok) assert.fail(replied.reason);
  assert.equal(replied.text.split("<!-- rv:seed").length, 2);
  assert.deepEqual(
    replied.threads.map((one) => [one.body, one.replies.length]),
    [["why today", 1]],
  );
});

test("a document outside the artifacts folder keeps its threads in the store and loses an old block", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stored-"));
  process.env.CLAUDE_CONFIG_DIR = dir;
  try {
    const path = join(dir, "plan.md");
    const old = applyReviewChange({ action: "create", body: "first", format: "md", text: "# Plan\n" });
    if (!old.ok) assert.fail(old.reason);

    const made = applyStoredReview({ action: "create", body: "second", path, text: old.text });
    if (!made.ok) assert.fail(made.reason);

    assert.equal(made.text, "# Plan\n");
    assert.deepEqual(
      made.threads.map((one) => one.body),
      ["first", "second"],
    );
    assert.equal(readComments(path, "# Plan\n")?.threads.length, 2);
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a stored document's card counts the threads in its store, a new one included", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "listed-")));
  process.env.CLAUDE_CONFIG_DIR = dir;
  process.env.NOTES_ARTIFACTS = join(dir, "pages");
  try {
    const path = join(dir, "plan.md");
    writeFileSync(path, "# Plan\n");
    mkdirSync(join(dir, "artifacts"));
    writeFileSync(join(dir, "artifacts", "session-0123abcd"), `${path}\n`);
    const count = async () => (await listArtifacts()).find((one) => one.path === path)?.threadCount;

    applyStoredReview({ action: "create", body: "first", path, text: "# Plan\n" });
    assert.equal(await count(), 1);
    applyStoredReview({ action: "create", body: "second", path, text: "# Plan\n" });
    assert.equal(await count(), 2);
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.NOTES_ARTIFACTS;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a listed entry is a page in the artifacts folder, a plan in the plans folder, and a document anywhere else", async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "kinds-")));
  process.env.CLAUDE_CONFIG_DIR = dir;
  try {
    mkdirSync(join(dir, "sidecar", "artifacts"), { recursive: true });
    writeFileSync(join(dir, "sidecar", "artifacts", "deck.html"), "<!doctype html>\n<title>Deck</title>\n");
    mkdirSync(join(dir, "plans"));
    const plan = join(dir, "plans", "brave-plan.md");
    const scratch = join(dir, "scratch.md");
    writeFileSync(plan, "# Plan\n");
    writeFileSync(scratch, "# Notes\n");
    mkdirSync(join(dir, "artifacts"));
    writeFileSync(join(dir, "artifacts", "session-0123abcd"), `${plan}\n${scratch}\n`);
    const kinds = Object.fromEntries((await listArtifacts()).map((one) => [one.title, one.kind]));
    assert.deepEqual(kinds, { Deck: "page", Plan: "plan", Notes: "document" });
  } finally {
    delete process.env.CLAUDE_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a document's slug is its stem made url-safe plus six hex of its path, exactly as bin/artifact names it", () => {
  assert.equal(Documents.slug("/tmp/notes/analysis/My Plan.md"), "My-Plan--5471ce");
});

test("the page is one section per h1 or h2, and no comment block leaks into it", async () => {
  const made = applyReviewChange({ action: "create", body: "before --> after", format: "md", text: NOTE });
  if (!made.ok) assert.fail(made.reason);
  const page = await Markdown.page({ markdown: made.text, title: "The plan" });
  const body = page.slice(page.indexOf("<body>"));
  assert.equal(body.split("<section").length, 3);
  assert.ok(!body.includes("after") && !body.includes("title:"), body);
  assert.ok(body.includes("<b>today</b>") && body.includes("a &lt; b"), body);
});
