import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const APP = new URL("../", import.meta.url);

test("no app component mounts a keycap inline, so keys show only in the one hover tip", () => {
  const inline = readdirSync(APP, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".vue"))
    .filter((path) => /<(UiKbd|Kbd)\b/.test(readFileSync(new URL(path, APP), "utf8")));
  assert.deepEqual(inline, [], 'put the keys in the control\'s data-tip, as "Send · {cmd enter}"');
});
