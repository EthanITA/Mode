import { startContract } from "../mode/announce.ts";
import { HOOK_CAP } from "../mode/constants.ts";
import { groundParts, rearmGround } from "../mode/rules.ts";
import { adopt } from "../mode/slots.ts";
import { context, payload, str } from "./io.ts";

export type StartPart = "rules-1" | "rules-2" | "mode" | "style";

function text(part: StartPart, session: string | undefined, path: string): string {
  switch (part) {
    case "rules-1":
      rearmGround(session);
      return groundParts(HOOK_CAP)[0] ?? "";
    case "rules-2":
      return groundParts(HOOK_CAP).slice(1).join("\n\n");
    case "mode":
    case "style":
      // Every part adopts on its own because the parts run in parallel, and adopt fills only an untouched slot.
      adopt({ path, session });
      return startContract({ axis: part, session });
  }
}

export function startPart(part: StartPart): void {
  try {
    const data = payload() ?? {};
    const session = str(data.session_id);
    // With no session nothing remembers what was told, so speaking would repeat it on the first prompt.
    if (!session) return;
    const said = text(part, session, str(data.cwd) || process.cwd());
    if (said) context("SessionStart", said);
  } catch {}
}
