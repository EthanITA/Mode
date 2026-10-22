import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { armed } from "../../lib/hook/guard.ts";
import { deny, payload, record, str } from "../../lib/hook/io.ts";
import { addedComments, markerOf } from "../../lib/style/comments.ts";
import { head, quote } from "../../lib/text.ts";

function check(): void {
  const data = payload();
  if (!data) return;
  const input = record(data.tool_input);
  const path = str(input.file_path);
  const marker = markerOf(extname(path).toLowerCase());
  if (!marker) return;

  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const added = addedComments(before, str(input.content) || str(input.new_string), marker);
  if (!added.length) return;
  deny(
    `comment-guard — this edit to ${basename(path)} adds ${added.map((line) => quote(head(line, 60))).join(", ")}, ` +
      "and new code carries zero comments. Make the same edit again without those comment lines, leaving every " +
      "comment the file already has in place. Directives such as eslint-disable, @ts-expect-error or noqa pass. " +
      "Do not narrate the check itself.",
  );
}

if (armed()) {
  try {
    check();
  } catch {}
}
