import assert from "node:assert/strict";
import { test } from "node:test";
import { echoesNote } from "./transcript.ts";

test("only a note repeated back to back is an echo", () => {
  const note = { kind: "note", role: "system", text: "Command(compact)" };
  assert.equal(echoesNote(note, { ...note }), true);
  assert.equal(echoesNote(note, undefined), false);
  assert.equal(echoesNote(note, { role: "assistant", text: "Command(compact)" }), false);
});
