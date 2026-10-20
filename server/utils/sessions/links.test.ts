import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { sessionEntries } from "../../../lib/artifact/store.ts";
import * as Events from "../../../lib/sidecar/events.ts";
import { readRecord, removeRecord } from "../../../lib/web/records.ts";
import { Links } from "./links.ts";

let root: string;
let restore: () => void;

before(() => {
  root = mkdtempSync(join(tmpdir(), "sidecar-links-"));
  const had = "CLAUDE_CONFIG_DIR" in process.env;
  const was = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = root;
  restore = () => (had ? (process.env.CLAUDE_CONFIG_DIR = was ?? "") : delete process.env.CLAUDE_CONFIG_DIR);
});

after(() => {
  restore();
  rmSync(root, { recursive: true, force: true });
});

const at = (s: number): string => `2026-01-01T09:00:0${s}.000Z`;
const user = (s: number, content: string) => ({ type: "user", timestamp: at(s), message: { role: "user", content } });
const assistant = (s: number, content: Record<string, unknown>[]) => ({
  type: "assistant",
  timestamp: at(s),
  message: { role: "assistant", content },
});
const said = (s: number, text: string) => assistant(s, [{ type: "text", text }]);
const called = (s: number, id: string, name: string, input: Record<string, unknown>) =>
  assistant(s, [{ type: "tool_use", id, name, input }]);
const answered = (s: number, id: string, content: string) => ({
  type: "user",
  timestamp: at(s),
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] },
});
const lines = (...entries: Record<string, unknown>[]): string =>
  entries.map((one) => `${JSON.stringify(one)}\n`).join("");
const urls = (key: string): string[] => sessionEntries(key).map((slug) => readRecord(slug)?.url ?? "");

test("reads every address in prose, trimming what the sentence or markdown wrapped around it, and none in code", () => {
  const text = [
    "See [the MR](https://gitlab.com/a/b/-/merge_requests/7) and https://example.com/docs.",
    "**https://bold.dev/x**, (https://en.wikipedia.org/wiki/Foo_(bar)) and <https://angle.io/y>",
    "`https://inline.dev` and https://example.com/docs again",
    "```",
    "curl https://fenced.dev/api",
    "```",
  ].join("\n");
  assert.deepEqual(Links.of(text), [
    "https://gitlab.com/a/b/-/merge_requests/7",
    "https://example.com/docs",
    "https://bold.dev/x",
    "https://en.wikipedia.org/wiki/Foo_(bar)",
    "https://angle.io/y",
  ]);
});

test("adopts what the user or Claude links once, never what WebFetch or WebSearch brought in, and announces only live ones", () => {
  const key = "abcdef12";
  const path = join(root, "projects", "-tmp-links", `${key}-1111-2222-3333-444444444444.jsonl`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    lines(
      user(1, "look at https://github.com/a/b and https://fetched.dev/page"),
      {
        type: "user",
        isMeta: true,
        timestamp: at(1),
        message: { role: "user", content: "a skill's https://skill.dev" },
      },
      assistant(2, [{ type: "thinking", thinking: "maybe https://thought.dev" }]),
      called(3, "f1", "WebFetch", { url: "https://fetched.dev/page", prompt: "read it" }),
      answered(4, "f1", "the page links https://inside.dev/x"),
      called(5, "s1", "WebSearch", { query: "chrome storage" }),
    ),
  );
  const events = Events.end();

  Links.adopt({ key });
  appendFileSync(
    path,
    lines(
      answered(
        6,
        "s1",
        'Links: [{"title":"A","url":"https://found.dev/a/?hl=es"},{"title":"B","url":"https://video.dev/watch?v=one"}]',
      ),
      said(
        7,
        "it links https://docs.dev/x and https://video.dev/watch?v=two, see https://inside.dev/x\n\nSources:\n- [A](https://found.dev/a)\n- [B](https://video.dev/watch?v=one)",
      ),
    ),
  );
  Links.adopt({ key });
  assert.deepEqual(urls(key), [
    "https://github.com/a/b",
    "https://fetched.dev/page",
    "https://docs.dev/x",
    "https://video.dev/watch?v=two",
  ]);
  assert.equal(Events.read(events).events.length, 0);

  const [first = ""] = sessionEntries(key);
  removeRecord(first);
  appendFileSync(
    path,
    lines(said(8, "again https://github.com/a/b, new https://new.dev"), user(9, "https://inside.dev/x")),
  );
  Links.adopt({ key, isLive: true });

  assert.deepEqual(urls(key), [
    "",
    "https://fetched.dev/page",
    "https://docs.dev/x",
    "https://video.dev/watch?v=two",
    "https://new.dev/",
    "https://inside.dev/x",
  ]);
  assert.deepEqual(
    Events.read(events).events.map((event) => [event.key, event.data.title]),
    [
      [key, "new.dev"],
      [key, "inside.dev"],
    ],
  );
});

test("a catch-up up to a byte lands quietly, and only what was said after it is announced", () => {
  const key = "fedcba98";
  const path = join(root, "projects", "-tmp-links", `${key}-1111-2222-3333-444444444444.jsonl`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines(said(1, "before https://old.dev")));
  const upTo = statSync(path).size;
  appendFileSync(path, lines(said(2, "now https://now.dev")));
  const events = Events.end();

  Links.adopt({ key, path, upTo });
  Links.adopt({ key, path, upTo });
  Links.adopt({ key, path, isLive: true });

  assert.deepEqual(urls(key), ["https://old.dev/", "https://now.dev/"]);
  assert.deepEqual(
    Events.read(events).events.map((event) => event.data.title),
    ["now.dev"],
  );
});
