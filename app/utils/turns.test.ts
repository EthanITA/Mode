import assert from "node:assert/strict";
import { test } from "node:test";
import type { TurnReceipt } from "../../shared/types/receipts.ts";
import type { ConversationVersions, FileVersion } from "../../shared/types/versions.ts";
import { Turns } from "./turns.ts";

const receipt = (turn: number, extra: Partial<TurnReceipt> = {}): TurnReceipt => ({
  turn,
  at: turn * 1000,
  prompt: `ask ${turn}`,
  read: [],
  wrote: [],
  deleted: [],
  ran: [],
  ...extra,
});

const version = (path: string, turn: number, extra: Partial<FileVersion> = {}): FileVersion => ({
  path,
  turn,
  at: 0,
  by: "session",
  sha: `${path}@${turn}`,
  bytes: 1,
  added: 2,
  removed: 1,
  ...extra,
});

const versions: ConversationVersions = {
  key: "k",
  turns: 4,
  bytes: 0,
  files: [
    {
      path: "/r/a.ts",
      baseline: "exact",
      versions: [version("/r/a.ts", 1), version("/r/a.ts", 3), version("/r/a.ts", 4)],
    },
    { path: "/r/new.ts", baseline: "absent", versions: [version("/r/new.ts", 1, { created: true, removed: 0 })] },
    { path: "/r/odd.ts", baseline: "unknown", versions: [version("/r/odd.ts", 3)] },
    { path: "/r/big.bin", baseline: "exact", skipped: "over the size budget", versions: [] },
    { path: "/r/dir", baseline: "unknown", versions: [] },
  ],
};

const receipts = [
  receipt(1, { wrote: ["/r/a.ts", "/r/new.ts", "/r/big.bin"], ran: [{ command: "spawned tester" }] }),
  receipt(2, { wrote: ["/r/probe.ts"], deleted: ["/r/probe.ts", "/r/dir"], ran: [{ command: "pnpm test" }] }),
  receipt(3, { wrote: ["/r/a.ts", "/r/odd.ts"] }),
  receipt(4, { prompt: undefined, wrote: ["/r/a.ts", "/r/late.ts", "/r/lib/a.ts"], by: ["tester"] }),
];

test("turns read newest first, with the receipt's files and the store's counts", () => {
  const turns = Turns.build({ receipts, versions, replies: new Map([[1, "done"]]), status: "busy" });
  assert.deepEqual(
    turns.map((one) => [one.turn, one.isOpen, one.state]),
    [
      [4, true, "running"],
      [3, false, "done"],
      [2, false, "done"],
      [1, false, "done"],
    ],
  );
  const first = turns.at(-1)!;
  assert.deepEqual(
    first.files.map((one) => [one.name, one.kind, one.churn?.added]),
    [
      ["a.ts", "changed", 2],
      ["new.ts", "created", 2],
      ["big.bin", "changed", undefined],
    ],
  );
  assert.deepEqual([first.added, first.removed, first.commands, first.reply], [4, 1, 0, "done"]);
  assert.equal(turns[2]!.commands, 1);
  assert.equal(Turns.build({ receipts, versions, replies: new Map(), status: "waiting" })[0]!.state, "waiting");
});

test("restore means before the turn, and says why when there is nothing to put back", () => {
  const turns = Turns.build({ receipts, versions, replies: new Map() });
  const plan = (turn: number, name: string) => {
    const one = turns.find((t) => t.turn === turn)!;
    return Turns.restoreOf({ turn: one, file: one.files.find((f) => f.name === name)!, versions });
  };
  assert.deepEqual(plan(1, "a.ts"), {
    isEnabled: true,
    tip: "Put a.ts back the way it was before turn 1. Turns 3 and 4 also changed it, so their edits go too.",
  });
  assert.equal(plan(1, "new.ts").isEnabled, false);
  assert.match(plan(1, "new.ts").tip, /didn't exist before turn 1/);
  assert.match(plan(3, "odd.ts").tip, /was never recorded/);
  assert.match(plan(1, "big.bin").tip, /never versioned/);
  assert.match(plan(4, "late.ts").tip, /isn't in the version store yet/);
  assert.deepEqual(
    turns[2]!.files.map((one) => one.kind),
    ["unchanged", "deleted"],
  );
  assert.equal(plan(2, "probe.ts").tip, "probe.ts ended turn 2 the way it started, so there's nothing to put back.");
  assert.match(plan(2, "dir").tip, /kept no copy of dir/);
  assert.deepEqual(
    turns[0]!.files.map((one) => one.name),
    ["r/a.ts", "late.ts", "lib/a.ts"],
  );
  assert.equal(plan(4, "r/a.ts").tip, "Put r/a.ts back the way it was before this work");

  const busy = Turns.build({ receipts, versions, replies: new Map(), status: "busy" })[0]!;
  assert.match(Turns.restoreOf({ turn: busy, file: busy.files[0]!, versions }).tip, /still running/);
});
