import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { readTextSafe, writeText } from "../../lib/files.ts";
import { armed } from "../../lib/hook/guard.ts";
import { deny, payload, record, str } from "../../lib/hook/io.ts";
import { statePath } from "../../lib/mode/state.ts";
import { addedBlocks, headerOf, markerOf, overreach, shown } from "../../lib/style/comments.ts";
import { lines } from "../../lib/text.ts";

const TEST =
  "Before it lands, decide whether it earns its place. The default is zero comments, and one stays only when the " +
  "logic is genuinely non-obvious and the comment saves real reading, or when the code deliberately does what a " +
  "reader would not expect for a reason it cannot express: a hidden constraint, a linked workaround, a rejected " +
  "obvious alternative. It says why, never what, in one line above the function, store or class it explains. A " +
  "file header, a usage block, a docstring restating the signature or a line narrating the code fails. If it " +
  "fails, make the edit again without it. If it passes, send the same edit again unchanged and it goes through.";

const keyOf = (path: string, block: string[]): string =>
  createHash("sha1")
    .update(`${path}\n${block.join("\n")}`)
    .digest("hex")
    .slice(0, 16);

function check(): void {
  const data = payload();
  if (!data) return;
  const input = record(data.tool_input);
  const path = str(input.file_path);
  const marker = markerOf(extname(path).toLowerCase());
  if (!marker) return;

  const after = str(input.content) || str(input.new_string);
  const blocks = addedBlocks(readTextSafe(path) ?? "", after, marker);
  if (!blocks.length) return;

  const header = data.tool_name === "Write" ? headerOf(after, marker) : undefined;
  const refused: string[] = [];
  const asked: string[][] = [];
  for (const block of blocks) {
    const said = overreach(block, header);
    if (said) refused.push(said);
    else asked.push(block);
  }

  const memory = statePath(str(data.session_id), ".comments");
  const seen = new Set(lines(readTextSafe(memory) ?? ""));
  const fresh = memory ? asked.filter((block) => !seen.has(keyOf(path, block))) : [];
  if (!refused.length && !fresh.length) return;
  if (memory && fresh.length) writeText(memory, [...seen, ...fresh.map((block) => keyOf(path, block)), ""].join("\n"));

  const parts = [`comment-guard on ${basename(path)}:`];
  if (refused.length)
    parts.push(`${refused.join("; ")}. These are refused however often the edit is sent, so shorten or drop them.`);
  if (fresh.length) parts.push(`New comment ${fresh.map(shown).join(", ")}. ${TEST}`);
  deny(`${parts.join(" ")} Do not narrate the check itself.`);
}

if (armed()) {
  try {
    check();
  } catch {}
}
