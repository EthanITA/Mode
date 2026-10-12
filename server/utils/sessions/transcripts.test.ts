import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ALPHA_ID, useFixtures } from "./__fixtures__/env.ts";
import { forkable, identityOf, transcriptIndex, type TranscriptRef } from "./transcripts.ts";

let restore: () => void;

before(() => {
  restore = useFixtures();
});

after(() => restore());

function ref(key: string): TranscriptRef {
  const found = transcriptIndex().get(key);
  assert.ok(found, `expected a transcript keyed ${key}`);
  return found;
}

test("the index keys every project folder's transcripts by the first 8 hex of the uuid", () => {
  assert.deepEqual([...transcriptIndex().keys()].sort(), ["aaaaaaaa", "bbbbbbbb"]);
  assert.equal(ref("aaaaaaaa").id, ALPHA_ID);
  assert.equal(ref("aaaaaaaa").slug, "-tmp-alpha");
});

test("identity comes from the session's own record, never a sidechain's", () => {
  const identity = identityOf(ref("aaaaaaaa"));
  assert.equal(identity.cwd, "/tmp/alpha");
  assert.equal(identity.gitBranch, "main");
});

test("a line that is not json, and a last line cut mid-write, are skipped rather than thrown on", () => {
  assert.deepEqual(identityOf(ref("aaaaaaaa")).names, ["Alpha, named by hand", "auto guessed alpha"]);
});

test("name candidates arrive best first: hand-typed, then agent name, then the guessed one", () => {
  assert.deepEqual(identityOf(ref("bbbbbbbb")).names, ["bbbbbbbb", "Beta, auto but real"]);
});

test("a transcript unchanged since the last read is answered from the cache", () => {
  const first = identityOf(ref("aaaaaaaa"));
  assert.equal(identityOf(ref("aaaaaaaa")), first);
});

test("a fork's copy points resume at the newest main-chain entry, so the turn still running is in it", () => {
  const rows = [
    { type: "user", uuid: "u1", isSidechain: false, sessionId: "s", version: "2.1.296" },
    { type: "assistant", uuid: "a1", isSidechain: false, version: "2.1.296", message: { model: "claude-opus-5-5" } },
    { type: "last-prompt", lastPrompt: "hi", leafUuid: "a1", sessionId: "s" },
    { type: "assistant", uuid: "a2", isSidechain: false, version: "2.1.296", message: { model: "<synthetic>" } },
    { type: "assistant", uuid: "x1", isSidechain: true, version: "2.1.296", message: { model: "claude-haiku-4-5" } },
  ];
  const whole = rows.map((row) => JSON.stringify(row)).join("\n");
  const fork = forkable(`${whole}\n{"type":"assistant","uuid":"a3"`);
  assert.ok(fork);
  const lines = fork.text.trimEnd().split("\n");
  assert.equal(lines.length, rows.length + 1);
  assert.deepEqual(JSON.parse(lines.at(-1) ?? ""), {
    type: "last-prompt",
    lastPrompt: "hi",
    leafUuid: "a2",
    sessionId: "s",
  });
  assert.equal(fork.model, "claude-opus-5-5");
  assert.equal(fork.version, "2.1.296");
  assert.equal(forkable('{"type":"last-prompt","leafUuid":"a1"}\n'), undefined);
});
