import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

test("adopts each address the user or Claude said once, keeps a removed one gone, and announces only live ones", () => {
  const key = "abcdef12";
  const path = join(root, "projects", "-tmp-links", `${key}-1111-2222-3333-444444444444.jsonl`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    lines(
      user(1, "look at https://github.com/a/b please"),
      assistant(2, [{ type: "thinking", thinking: "maybe https://thought.dev" }]),
      assistant(3, [{ type: "tool_use", id: "t1", name: "WebFetch", input: { url: "https://fetched.dev" } }]),
      assistant(4, [{ type: "text", text: "it links https://docs.dev/x and https://github.com/a/b" }]),
    ),
  );
  const events = Events.end();

  Links.adopt({ key });
  assert.deepEqual(urls(key), ["https://github.com/a/b", "https://docs.dev/x"]);
  assert.equal(Events.read(events).events.length, 0);

  const [first = ""] = sessionEntries(key);
  removeRecord(first);
  appendFileSync(
    path,
    lines(assistant(5, [{ type: "text", text: "again https://github.com/a/b, new https://new.dev" }])),
  );
  Links.adopt({ key, isLive: true });

  assert.deepEqual(urls(key), ["", "https://docs.dev/x", "https://new.dev/"]);
  assert.deepEqual(
    Events.read(events).events.map((event) => [event.key, event.data.title]),
    [[key, "new.dev"]],
  );
});
