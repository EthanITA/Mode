import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

const SIDECAR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", "sidecar");
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "sidecar-artifacts-")));
const arts = join(tmp, "artifacts");
const config = join(tmp, "config");
process.env.CLAUDE_CONFIG_DIR = config;
const vars = { ...process.env, NOTES_ARTIFACTS: arts, CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: "" };
const sidecar = (...args: string[]) => spawnSync(SIDECAR, args, { encoding: "utf8", env: vars });
const read = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8") : "");
const write = (path: string, text: string): string => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};
const slugOf = (path: string, stem: string): string =>
  `${stem}--${createHash("sha1").update(path).digest("hex").slice(0, 6)}`;
const thread = { id: "t0", n: 1, by: "user", at: "a", updated: "a", body: "old", status: "open", replies: [] };

describe("comments", () => {
  test("on a .md land in one trailing block that a --> inside a thread cannot close, and read back whole", () => {
    write(join(arts, "plan.md"), "# The plan\n\nShip it.\n");
    const sent = write(
      join(tmp, "plan.comments.json"),
      JSON.stringify({ threads: [{ ...thread, id: "t1", body: "before --> after" }] }),
    );
    sidecar("comments", "plan", "--ingest", sent);
    assert.equal(sidecar("comments", "plan", "--reply", "1", "done").status, 0);
    const body = read(join(arts, "plan.md"));
    assert.ok(body.split("<!-- rv:seed").length === 2 && !body.includes("--> after") && body.endsWith("-->\n"), body);
    const doc = JSON.parse(sidecar("comments", "plan", "--json", "--no-ingest").stdout || "{}") as {
      threads?: { body: string; replies?: unknown[] }[];
    };
    assert.deepEqual(
      doc.threads?.map(({ body, replies }) => [body, replies?.length]),
      [["before --> after", 1]],
    );
  });

  test("on a .md outside the folder stay in the sidecar store, leaving the file as it was and lifting out an old block", () => {
    const doc = write(
      join(tmp, "notes", "plan.md"),
      `# Plan\n\nShip it.\n\n<!-- rv:seed\n${JSON.stringify({ v: 1, threads: [thread] })}\n-->\n`,
    );
    assert.equal(sidecar("comments", doc, "--reply", "1", "done").status, 0);
    assert.equal(read(doc), "# Plan\n\nShip it.\n");
    const stored = JSON.parse(read(join(config, "sidecar", "comments", `${slugOf(doc, "plan")}.json`))) as {
      threads: { body: string; replies: unknown[] }[];
    };
    assert.deepEqual(
      stored.threads.map(({ body, replies }) => [body, replies.length]),
      [["old", 1]],
    );
  });

  test("on a .md reached through a symlink read the same store as its real path", () => {
    const doc = write(
      join(tmp, "rules", "relay.md"),
      `# Relay\n\n<!-- rv:seed\n${JSON.stringify({ v: 1, threads: [thread] })}\n-->\n`,
    );
    const link = join(tmp, "linked", "relay.md");
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(doc, link);
    assert.equal(sidecar("comments", doc, "--reply", "1", "done").status, 0);
    const seen = JSON.parse(sidecar("comments", link, "--json", "--no-ingest").stdout || "{}") as {
      threads?: { replies: unknown[] }[];
    };
    assert.deepEqual(
      seen.threads?.map(({ replies }) => replies.length),
      [1],
    );
  });

  test("on a web entry resolve by part of its slug, name the page each was left on, and close in its record", () => {
    const slug = "localhost-4000--abc123";
    const file = write(
      join(config, "sidecar", "web", `${slug}.json`),
      JSON.stringify({
        v: 1,
        slug,
        url: "http://localhost:4000/guide/hooks",
        port: 47490,
        title: "Docs",
        threads: [{ ...thread, id: "w1", body: "simpler?", anchor: { label: "Drift", page: "/guide/hooks" } }],
        updated: "a",
      }),
    );
    assert.match(
      sidecar("comments", "localhost-4000").stdout,
      /#1 {2}open {6}Drift on http:\/\/localhost:4000\/guide\/hooks/,
    );
    assert.equal(sidecar("comments", slug, "--resolve", "1", "rewrote it").status, 0);
    const kept = JSON.parse(read(file)) as { threads: { status: string; replies: unknown[] }[] };
    assert.deepEqual([kept.threads[0]?.status, kept.threads[0]?.replies.length], ["resolved", 1]);
    assert.equal(sidecar("comments", "nonesuch").status, 1);
  });
});

describe("web entries", () => {
  test("what is typed opens as the address it names, or as a search, the way a browser's bar reads it", async () => {
    const { addressOf, parseTarget } = await import("../web/target.ts");
    assert.equal(parseTarget("localhost:3000/guide/hooks")?.href, "http://localhost:3000/guide/hooks");
    assert.equal(parseTarget("docs.mode.dev/guide")?.href, "https://docs.mode.dev/guide");
    assert.equal(parseTarget("myapp.localhost")?.href, "http://myapp.localhost/");
    assert.equal(parseTarget("intranet:8080")?.href, "https://intranet:8080/");
    for (const typed of ["vue", "how to center a div", "ftp://files.dev", "  "])
      assert.equal(parseTarget(typed), undefined, typed);
    assert.equal(addressOf("how to center a div")?.href, "https://www.google.com/search?q=how%20to%20center%20a%20div");
    assert.equal(addressOf("localhost")?.href, "http://localhost/");
    assert.equal(addressOf(" "), undefined);
  });

  test("every open is a new artifact, and only a reuse lands on one already opened on or showing the address", async () => {
    const { openRecord, readRecord, removeRecord, restoreRecord, updateRecord, webSlug } =
      await import("../web/records.ts");
    const guide = new URL("http://localhost:3000/guide");
    const first = openRecord({ url: guide });
    const second = openRecord({ title: "Mode docs", url: guide });
    assert.match(first.record.slug, /^localhost-3000-[0-9a-f]{6}$/);
    assert.deepEqual([first.isNew, second.isNew, second.record.title], [true, true, "Mode docs"]);
    assert.notEqual(second.record.slug, first.record.slug);

    const mine = [first.record.slug];
    assert.deepEqual(
      [openRecord({ reuse: mine, url: guide }).record.slug, openRecord({ reuse: mine, url: guide }).isNew],
      [first.record.slug, false],
    );
    assert.equal(openRecord({ reuse: mine, url: new URL("http://localhost:3000/other") }).isNew, true);
    updateRecord(first.record.slug, { url: new URL("https://www.google.com/") });
    const back = openRecord({ reuse: mine, url: guide });
    assert.deepEqual(
      [back.isNew, back.record.url, readRecord(first.record.slug)?.trail?.urls.at(-1)],
      [false, guide.href, guide.href],
    );

    const gone = removeRecord(second.record.slug);
    assert.ok(gone && !readRecord(second.record.slug));
    assert.ok(restoreRecord({ ...gone, threads: [{ id: "t1" }] }));
    assert.deepEqual(readRecord(second.record.slug)?.threads, [{ id: "t1" }]);
    assert.equal(restoreRecord({ ...gone, slug: "../out" }), undefined);
    assert.match(webSlug(new URL("https://www.reddit.com/r/vue")), /^reddit-[0-9a-f]{6}$/);
    const long = webSlug(new URL(`https://${"feature-branch-".repeat(3)}mode-docs-team.vercel.app/`));
    assert.ok(long.length <= 31 && /^[a-z0-9][a-z0-9-]*-[0-9a-f]{6}$/.test(long), long);
  });

  test("an entry from when it was one site keeps its threads, placed on that site's whole address", async () => {
    const { readRecord } = await import("../web/records.ts");
    write(
      join(config, "sidecar", "web", "old-site-80--aaaaaa.json"),
      JSON.stringify({
        port: 49001,
        slug: "old-site-80--aaaaaa",
        threads: [{ anchor: { label: "Drift", page: "/guide?x=1" }, id: "a" }, { id: "b" }],
        updated: "",
        url: "http://old.site/changelog",
        v: 1,
      }),
    );
    const held = readRecord("old-site-80--aaaaaa");
    assert.deepEqual(
      [held?.v, held?.threads],
      [2, [{ anchor: { label: "Drift", page: "http://old.site/guide?x=1" }, id: "a" }, { id: "b" }]],
    );
  });
});

test("the event log resumes from an offset, and a half-written line waits for the next read", async () => {
  const Events = await import("./events.ts");
  const before = Events.end();
  Events.publish({
    topic: "artifact.created",
    data: { slug: "announced", title: "Announced", path: join(arts, "announced.html") },
  });
  const { events, offset } = Events.read(before);
  assert.deepEqual(
    events.map(({ topic, data }) => [topic, data.slug, data.title]),
    [["artifact.created", "announced", "Announced"]],
  );
  appendFileSync(Events.logFile(), '{"topic":"artifact.created"');
  assert.deepEqual(Events.read(offset), { events: [], offset });
});
