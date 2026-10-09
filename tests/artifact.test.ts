import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ARTIFACT, env, PLUGIN, run, scratch, write } from "./support.ts";

const tmp = scratch("mode-artifact-");
const arts = join(tmp, "artifacts");
const config = join(tmp, "config");
const vars = env({ NOTES_ARTIFACTS: arts, CLAUDE_CONFIG_DIR: config });
const artifact = (...args: string[]) => run(ARTIFACT, args, { env: vars });
const read = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8") : "");
const SKILL = join(PLUGIN, "skills", "create-artifact");

describe("stamp and list", () => {
  test("a title taken from the page is unescaped into the stamp", () => {
    const page = write(join(arts, "alpha.html"), "<!doctype html>\n<title>Alpha &middot; Beta&#8230;</title>\n");
    assert.equal(artifact("stamp", "alpha").status, 0);
    assert.match(read(page), /title: {3}Alpha · Beta…/);
  });

  test("a .md is listed, while a .md sharing a page's slug is that page's brief", () => {
    write(join(arts, "plan.md"), "# The plan\n\nShip it.\n");
    write(join(arts, "alpha.md"), "# A brief for the alpha page\n");
    const listed = artifact("list", "--tsv").stdout;
    assert.deepEqual(
      listed
        .split("\n")
        .filter(Boolean)
        .map((row) => row.split("\t")[0])
        .sort(),
      ["alpha", "plan"],
    );
    assert.ok(!listed.includes("alpha.md"), listed);
  });

  test("stamping a .md puts the block on top, titled from its first heading", () => {
    assert.equal(artifact("stamp", "plan").status, 0);
    const body = read(join(arts, "plan.md"));
    assert.ok(
      body.startsWith("<!-- artifact\n") && body.includes("title:   The plan") && body.includes("target:  s"),
      body,
    );
  });
});

describe("comments on a .md", () => {
  test("land in one trailing block that a --> inside a thread cannot close, and read back whole", () => {
    const sent = write(
      join(tmp, "plan.comments.json"),
      JSON.stringify({
        threads: [
          { id: "t1", n: 1, by: "user", at: "a", updated: "a", body: "before --> after", status: "open", replies: [] },
        ],
      }),
    );
    artifact("comments", "plan", "--ingest", sent);
    assert.equal(artifact("comments", "plan", "--reply", "1", "done").status, 0);
    const body = read(join(arts, "plan.md"));
    assert.ok(body.split("<!-- rv:seed").length === 2 && !body.includes("--> after") && body.endsWith("-->\n"), body);
    const doc = JSON.parse(artifact("comments", "plan", "--json", "--no-ingest").stdout || "{}") as {
      threads?: { body: string; replies?: unknown[] }[];
    };
    assert.deepEqual(
      doc.threads?.map(({ body, replies }) => [body, replies?.length]),
      [["before --> after", 1]],
    );
  });
});

describe("new and kit", () => {
  const packs = join(config, "mode", "design-systems");
  write(
    join(packs, "layered.md"),
    '# Layered\n\n**Kind:** user pack\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter&display=swap">\n',
  );
  write(join(packs, "layered.css"), ':root[data-ds="layered"] { --accent: LAYERED; }\n');
  write(join(packs, "whole.md"), "# Whole\n\n**Kind:** user pack\n");
  write(join(packs, "whole.css"), ":root { --canvas: WHOLE; }\n");
  const page = (key: string): string => read(join(arts, `kit-${key}.html`));

  test("new splices the stylesheets each pack names, stamps it, and installs the kit and the review layer once", () => {
    for (const [key, shared, own] of [
      ["neutral", true, ""],
      ["layered", true, "LAYERED"],
      ["whole", false, "WHOLE"],
    ] as const) {
      const done = artifact("new", `kit-${key}`, "--ds", key, "--title", "Kit & co");
      const body = page(key);
      assert.equal(done.status, 0, done.stderr);
      assert.equal(body.includes("Styles only against generic vars"), shared, key);
      assert.ok(body.includes(own) && body.includes(`data-ds="${key}"`) && body.includes(`ds:      ${key}`), key);
      assert.ok(body.includes("<title>Kit &amp; co</title>") && !body.includes("{{INLINE_STYLESHEETS}}"), key);
      assert.deepEqual([body.split("<!-- cx:start -->").length, body.split("<!-- rv:start -->").length], [2, 2], key);
    }
    assert.match(page("layered"), /fonts\.googleapis\.com\/css2\?family=Inter/);
  });

  test("new refuses a slug that already has a page, and kit refreshes in place", () => {
    const before = page("neutral");
    assert.equal(artifact("new", "kit-neutral", "--ds", "neutral").status, 2);
    assert.equal(page("neutral"), before);
    artifact("kit", "kit-neutral");
    assert.equal(artifact("kit", "kit-neutral").status, 0);
    assert.deepEqual(
      [page("neutral").split("<!-- cx:start -->").length, page("neutral").split("<!-- cx:end -->").length],
      [2, 2],
    );
  });

  test("the demo page carries the kit byte for byte, and passes both publishing gates", () => {
    const demo = join(SKILL, "references", "components.html");
    const block = /<!-- cx:start -->[\s\S]*?<!-- cx:end -->\n?/.exec(read(demo))?.[0];
    assert.equal(
      block,
      read(join(SKILL, "assets", "kit.html")),
      "refresh it with: NOTES_ARTIFACTS=skills/create-artifact/references bin/artifact kit components",
    );
    for (const gate of [["check-artifact.sh", "--target", "s"], ["check-prose.sh"]]) {
      const done = run("bash", [join(SKILL, "scripts", gate[0] ?? ""), ...gate.slice(1), demo]);
      assert.equal(done.status, 0, done.stdout.slice(-600));
    }
  });
});

describe("a .md outside the folder", () => {
  test("is recorded by its path under a document slug, listed by the conversation and resolved from any other", () => {
    const doc = write(
      join(tmp, "notes", "analysis", "Gold timeline.md"),
      "# Gold order timeline\n\nSaxo said unknown.\n",
    );
    const slug = `Gold-timeline--${createHash("sha1").update(doc).digest("hex").slice(0, 6)}`;
    const mine = env({ ...vars, CLAUDE_CODE_SESSION_ID: "d0c5e55a-cli" });
    const touched = run(ARTIFACT, ["touch", doc], { env: mine });
    assert.ok(touched.status === 0 && touched.stdout.includes(slug), touched.stderr);
    assert.ok(run(ARTIFACT, ["list", "--session", "--tsv"], { env: mine }).stdout.includes(`${slug}\t${doc}`));
    assert.equal(artifact("path", slug).stdout.trim(), doc);
  });

  test("keeps its comments in the sidecar store, leaving the file as it was and lifting out an old block", () => {
    const threads = [{ id: "t0", n: 1, by: "user", at: "a", updated: "a", body: "old", status: "open", replies: [] }];
    const doc = write(
      join(tmp, "notes", "plan.md"),
      `# Plan\n\nShip it.\n\n<!-- rv:seed\n${JSON.stringify({ v: 1, threads })}\n-->\n`,
    );
    assert.equal(artifact("comments", doc, "--reply", "1", "done").status, 0);
    assert.equal(read(doc), "# Plan\n\nShip it.\n");
    const slug = `plan--${createHash("sha1").update(doc).digest("hex").slice(0, 6)}`;
    const stored = JSON.parse(read(join(config, "sidecar", "comments", `${slug}.json`))) as {
      threads: { body: string; replies: unknown[] }[];
    };
    assert.deepEqual(
      stored.threads.map(({ body, replies }) => [body, replies.length]),
      [["old", 1]],
    );
  });
});
