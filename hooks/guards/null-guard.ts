import { basename, extname } from "node:path";
import { armed } from "../../lib/hook/guard.ts";
import { payload, postContext, record, str } from "../../lib/hook/io.ts";
import { EXTERNAL_PATH, offenders, TYPED } from "../../lib/style/nulls.ts";

function check(): void {
  const data = payload();
  if (!data) return;
  const input = record(data.tool_input);
  const path = str(input.file_path);
  if (!TYPED.has(extname(path).toLowerCase()) || EXTERNAL_PATH.test(path)) return;

  const findings = offenders(str(input.content) || str(input.new_string));
  if (!findings.length) return;
  postContext(
    `null-guard on ${basename(path)} — ${findings.join("; ")}\n\nThe rule this guard enforces: \`undefined\`, not ` +
      '`null`, for "no value" — return types, refs, optional fields. A helper you author ' +
      "returning `Promise<T | null>` is wrong; return `Promise<T | undefined>`. Optionality is " +
      "`?:` and nothing else. Never test absence by comparison.\n\n`null` is allowed only where an " +
      "external contract demands it — DB columns, foreign JSON, drizzle inserts. If that is the " +
      "case here, say so on the line with an `external contract` comment; otherwise fix it now. " +
      "Do not narrate the check itself; if you revise, say what changed in a clause.",
  );
}

if (armed()) {
  try {
    check();
  } catch {}
}
