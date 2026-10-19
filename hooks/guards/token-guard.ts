import { basename, extname } from "node:path";
import { armed } from "../../lib/hook/guard.ts";
import { payload, postContext, record, str } from "../../lib/hook/io.ts";
import { EXEMPT_PATH, offenders, STYLED } from "../../lib/style/tokens.ts";

function check(): void {
  const data = payload();
  if (!data) return;
  const input = record(data.tool_input);
  const path = str(input.file_path);
  if (!STYLED.has(extname(path).toLowerCase()) || EXEMPT_PATH.test(path)) return;

  const findings = offenders(str(input.content) || str(input.new_string));
  if (!findings.length) return;
  postContext(
    `token-guard on ${basename(path)}: ${findings.join("; ")}\n\nThe rule this guard enforces: UI is built from ` +
      "the design system's components and tokens, never from scratch (`@cela/design` in a Cela product). A colour " +
      "is a palette token, a duration a `--duration-*` token, a curve an `--ease-*` token, and a type, radius or " +
      "spacing size its utility, and a component the design system already has is reused or extended, never " +
      "rebuilt beside it. A raw value stays only where no token can say it, such as SVG geometry, a keyframe " +
      "offset, a calc() over a runtime variable or a vendor brand colour, and that line carries a `no token` " +
      "comment saying why. Fix it now. Do not narrate the check itself; if you revise, say what changed in a clause.",
  );
}

if (armed()) {
  try {
    check();
  } catch {}
}
