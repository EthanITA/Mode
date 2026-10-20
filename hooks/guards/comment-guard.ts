import { basename, extname } from "node:path";
import { armed } from "../../lib/hook/guard.ts";
import { payload, postContext, record, str } from "../../lib/hook/io.ts";
import { addedBlocks, markerOf, opensWithHeader, verdicts } from "../../lib/style/comments.ts";
import { strip } from "../../lib/text.ts";

function check(): void {
  const data = payload();
  if (!data) return;
  const input = record(data.tool_input);
  const path = str(input.file_path);
  const marker = markerOf(extname(path).toLowerCase());
  if (!marker) return;

  const added = str(input.content) || str(input.new_string);
  if (!strip(added)) return;

  const blocks = addedBlocks(str(input.old_string), added, marker);
  if (!blocks.length) return;

  const isWrite = data.tool_name === "Write";
  const isCreated = str(record(data.tool_response).type) === "create";
  const findings = verdicts(blocks, isWrite && opensWithHeader(added, marker), isWrite && !isCreated);
  if (!findings.length) return;
  postContext(
    `comment-guard on ${basename(path)} — ${findings.join("; ")}\n\nThe rule this guard enforces: comment WHY, ` +
      "never WHAT, and say it in one line. Default is zero comments. Banned outright: file-header " +
      "blurbs, usage blocks, docstrings restating the signature, and anything describing what the " +
      "code does.\n\nA comment survives only if the logic is genuinely non-obvious, or the code " +
      "deliberately diverges from expectation for a specific reason — a hidden constraint, a " +
      "linked workaround, a rejected alternative. Even then it earns one line.\n\nThat call is the " +
      "user's, not yours: cut every comment named above now, and if you think one meets the test, " +
      "name it in one clause of your reply so the user can put it back. Do not narrate the check itself.",
  );
}

if (armed()) {
  try {
    check();
  } catch {}
}
